/**
 * LLM output validation with a repair loop.
 *
 * The provider's structured-output feature is a strong hint, not a guarantee:
 * every provider will occasionally emit a shape that does not satisfy the frozen
 * union. This module is the actual guarantee — nothing reaches a DB write that
 * has not passed Zod against `NoteDoc` / `CardInput`.
 *
 * On failure the Zod error is fed back to the model as a follow-up turn, up to
 * MAX_REPAIR_ATTEMPTS times. After that the caller gets `ai.invalidOutput` and
 * NO partial content is written (spec AC7).
 */

import { z } from 'zod';
import { CardInput } from '@neoformuflash/contracts';
import { err, ok, type Result } from '@/lib/result';

export const MAX_REPAIR_ATTEMPTS = 2;

/*
 * NoteDoc is a recursive discriminated union in packages/contracts/src/content.ts,
 * declared there with `z.custom<NoteDoc>()` at the schema boundary — which does
 * NOT structurally validate. A structural check is exactly what we need here,
 * because the input is model output rather than our own serializer.
 *
 * This is a deliberately shallow structural gate: it proves the doc is a
 * `{type:'doc', content:[...]}` tree whose nodes carry a known `type` and
 * well-formed math/text leaves. `proseToUnion` in lib/editor/serialize.ts stays
 * the deep trust boundary on the way into the editor.
 */
const KNOWN_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'blockquote',
  'displayMath',
] as const;

const KNOWN_INLINE_TYPES = ['text', 'inlineMath'] as const;

const NodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.string(),
      content: z.array(NodeSchema).optional(),
      text: z.string().optional(),
      latex: z.string().optional(),
      level: z.number().int().min(1).max(3).optional(),
      language: z.string().nullable().optional(),
      marks: z.record(z.string(), z.boolean()).optional(),
    })
    .refine(
      (n) =>
        (KNOWN_BLOCK_TYPES as readonly string[]).includes(n.type) ||
        (KNOWN_INLINE_TYPES as readonly string[]).includes(n.type),
      { error: 'ai.output.unknownNodeType' },
    )
    .refine((n) => n.type !== 'text' || typeof n.text === 'string', {
      error: 'ai.output.textNodeMissingText',
    })
    .refine(
      (n) => (n.type !== 'inlineMath' && n.type !== 'displayMath') || typeof n.latex === 'string',
      { error: 'ai.output.mathNodeMissingLatex' },
    ),
);

export const NoteDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(NodeSchema),
});

/*
 * The model supplies content + confidence + position; `deckId` is supplied by
 * the server from the authorised deck, and front/back text are derived from the
 * JSON server-side (never trusted from the model — the same trust boundary
 * phase 03b established for the card editor, root cause D3).
 */
export const GeneratedCardSchema = z.object({
  frontJson: NoteDocSchema,
  backJson: NoteDocSchema,
  confidence: CardInput.shape.confidence,
  position: z.number().int().min(0),
});
export type GeneratedCard = z.infer<typeof GeneratedCardSchema>;

export const GeneratedCardArraySchema = z.array(GeneratedCardSchema).min(1, 'ai.output.noCards');

/** Compact, model-readable rendering of a ZodError for the repair turn. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `- at ${i.path.length ? i.path.join('.') : '<root>'}: ${i.message}`)
    .join('\n');
}

/**
 * Validate `produce()`'s output against `schema`, re-invoking with the formatted
 * error on failure. `produce` receives `null` on the first attempt and the
 * previous failure's message on each repair turn.
 *
 * Returns the parsed value, or `err('ai.invalidOutput')` once attempts are spent.
 * The caller writes nothing on the error arm.
 *
 * If `schema` is `undefined`, no validation occurs — useful for string responses
 * that don't need structured output validation.
 */
export async function validateWithRepair<T>(
  schema: z.ZodType<T> | undefined,
  produce: (repairFeedback: string | null) => Promise<unknown>,
  maxAttempts: number = MAX_REPAIR_ATTEMPTS,
): Promise<Result<T>> {
  // If no schema, just run once and return
  if (!schema) {
    try {
      const raw = await produce(null);
      return ok(raw as T);
    } catch (cause) {
      return err('ai.providerError', cause);
    }
  }
  let feedback: string | null = null;
  let lastError: string | null = null;

  // 1 initial attempt + maxAttempts repairs.
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    let raw: unknown;
    try {
      raw = await produce(feedback);
    } catch (cause) {
      // A provider/network failure is not a schema problem — surface it as-is
      // rather than burning repair attempts on something a retry cannot fix.
      return err('ai.providerError', cause);
    }

    const parsed = schema.safeParse(raw);
    if (parsed.success) return ok(parsed.data);

    lastError = formatZodError(parsed.error);
    feedback = `Your previous output did not match the required schema:\n${lastError}\nReturn corrected JSON that satisfies the schema. Output JSON only.`;
  }

  return err('ai.invalidOutput', lastError);
}
