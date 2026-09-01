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
import { classifyProviderError } from './classify-error';

// Increased from 2 to 3 for higher success rate (1 initial + 3 repairs = 4 total attempts)
export const MAX_REPAIR_ATTEMPTS = 3;

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
    )
    /*
     * Nesting, not just node names. `unionToProse` (lib/editor/serialize.ts)
     * walks list children as listItems and listItem children as blocks; a model
     * that emits `bulletList > paragraph` used to pass this gate and then get
     * degraded silently on the client. Rejecting it here spends a repair turn
     * and gets a correctly-shaped doc instead.
     */
    .refine(
      (n) =>
        (n.type !== 'bulletList' && n.type !== 'orderedList') ||
        (n.content ?? []).every((c) => isRecordWithType(c, 'listItem')),
      { error: 'ai.output.listChildMustBeListItem' },
    )
    // A listItem holds blocks, never bare inline nodes.
    .refine(
      (n) =>
        n.type !== 'listItem' ||
        (n.content ?? []).every((c) => !isInlineNode(c)),
      { error: 'ai.output.listItemChildMustBeBlock' },
    ),
);

/** Narrow an unknown child node to `{ type: <expected> }`. */
function isRecordWithType(node: unknown, expected: string): boolean {
  return isPlainObject(node) && node.type === expected;
}

/** Whether a child node is one of the two inline types. */
function isInlineNode(node: unknown): boolean {
  return isPlainObject(node) && (node.type === 'text' || node.type === 'inlineMath');
}

/*
 * Whether a node subtree carries anything the editor would actually render.
 *
 * A model that declines a prompt (refusal, safety stop, truncation at max
 * tokens) still emits a *structurally valid* `{type:'doc',content:[]}` — or a
 * doc of empty paragraphs. That passed every refinement above, so the route
 * returned ok, the preview rendered blank, and Insert pushed a doc with no
 * blocks into the editor: the "generates nothing / inserts nothing" report.
 * An empty doc is never a useful answer, so treat it as a validation failure
 * and spend a repair turn asking again rather than handing back silence.
 */
function hasRenderableContent(node: unknown): boolean {
  if (!isPlainObject(node)) return false;

  // A math node renders whenever it carries non-blank LaTeX.
  if (node.type === 'inlineMath' || node.type === 'displayMath') {
    return typeof node.latex === 'string' && node.latex.trim().length > 0;
  }
  // A text node renders whenever it carries non-blank text.
  if (node.type === 'text') {
    return typeof node.text === 'string' && node.text.trim().length > 0;
  }
  // Any other block renders if some descendant does.
  return Array.isArray(node.content) && node.content.some(hasRenderableContent);
}

/*
 * Every prompt in lib/ai/providers describes the target as "Tiptap-compatible
 * JSON", so models reliably emit the *ProseMirror* spelling of that shape:
 * `marks` as an array of `{type}`, `latex`/`level` under `attrs`, and the
 * extension's `blockMath` name. All of it is unambiguously the doc we asked
 * for, and rejecting it burned the whole repair budget on a difference of
 * spelling rather than of meaning — `ai.invalidOutput` on output that was
 * fine. This normalises the PM spelling onto the union before validation;
 * the refinements above still reject anything genuinely unrecognised.
 *
 * `unionToProse` (lib/editor/serialize.ts) is the mirror of this on the way
 * back into the editor.
 */

type UnknownRecord = Record<string, unknown>;

const MARK_NAMES = new Set(['bold', 'italic', 'code']);

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** PM writes `[{type:'bold'}]`; the union writes `{bold:true}`. */
function normalizeMarks(marks: unknown): UnknownRecord | undefined {
  const out: UnknownRecord = {};

  if (Array.isArray(marks)) {
    for (const mark of marks) {
      const name = typeof mark === 'string' ? mark : isPlainObject(mark) ? mark.type : undefined;
      if (typeof name === 'string' && MARK_NAMES.has(name)) out[name] = true;
    }
  } else if (isPlainObject(marks)) {
    for (const [name, on] of Object.entries(marks)) {
      if (MARK_NAMES.has(name) && on) out[name] = true;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeNode(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;

  const node: UnknownRecord = { ...raw };
  const attrs = isPlainObject(node.attrs) ? node.attrs : {};
  delete node.attrs;

  // The math extension's block node name; the union calls it displayMath.
  if (node.type === 'blockMath') node.type = 'displayMath';

  // Handle alternative math node names models might produce
  if (node.type === 'math' || node.type === 'equation' || node.type === 'formula') {
    // Check if it has latex in attrs or top-level
    const latex = (typeof node.latex === 'string' ? node.latex :
                   typeof attrs.latex === 'string' ? attrs.latex : null);
    if (latex) {
      // Determine if inline or display based on context or presence of surrounding text
      // For now, default to displayMath for block-level math nodes
      node.type = 'displayMath';
      node.latex = latex;
    }
  }

  // Handle inline math variants
  if (node.type === 'inlineMath' || node.type === 'mathInline' || node.type === 'inlineEquation') {
    const latex = (typeof node.latex === 'string' ? node.latex :
                   typeof attrs.latex === 'string' ? attrs.latex : null);
    if (latex) {
      node.type = 'inlineMath';
      node.latex = latex;
    }
  }

  // A line break has no union node — carry the break as text rather than
  // failing the whole document over it.
  if (node.type === 'hardBreak') return { type: 'text', text: '\n' };

  // latex/level/language ride in `attrs` on PM JSON, top-level on the union.
  if (typeof node.latex !== 'string' && typeof attrs.latex === 'string') node.latex = attrs.latex;
  if (node.level === undefined && attrs.level !== undefined) node.level = attrs.level;
  if (node.language === undefined && attrs.language !== undefined) node.language = attrs.language;

  // Models reach for h4/h5 on deep outlines; the union stops at 3.
  // Also handle string levels
  if (node.level !== undefined) {
    const levelNum = typeof node.level === 'string' ? parseInt(node.level, 10) : node.level;
    if (typeof levelNum === 'number' && Number.isFinite(levelNum)) {
      node.level = Math.min(3, Math.max(1, Math.round(levelNum)));
    } else {
      delete node.level;
    }
  }

  const marks = normalizeMarks(node.marks);
  if (marks) node.marks = marks;
  else delete node.marks;

  // Strip unknown top-level properties to avoid validation failures
  const KNOWN_TOP_LEVEL = ['type', 'content', 'text', 'latex', 'level', 'language', 'marks'];
  for (const key of Object.keys(node)) {
    if (!KNOWN_TOP_LEVEL.includes(key)) {
      delete node[key];
    }
  }

  // Note: We do NOT add default empty strings for required fields (text, latex)
  // because the Zod schema refinements will properly reject nodes missing required fields.
  // This preserves the test behavior that validates required fields are present.

  if (Array.isArray(node.content)) node.content = node.content.map(normalizeNode);

  return node;
}

function normalizeDoc(raw: unknown): unknown {
  // A bare block array is unambiguous — the model just skipped the wrapper.
  if (Array.isArray(raw)) return { type: 'doc', content: raw.map(normalizeNode) };
  if (!isPlainObject(raw)) return raw;

  // JSON mode has no schema to anchor the root, so models wrap the doc in the
  // noun the prompt used.
  let doc = raw;
  if (doc.type !== 'doc') {
    for (const key of ['noteDoc', 'doc', 'document', 'result']) {
      if (isPlainObject(doc[key])) {
        doc = doc[key];
        break;
      }
    }
  }

  const out: UnknownRecord = { ...doc };
  if (out.type !== 'doc' && Array.isArray(out.content)) out.type = 'doc';
  if (Array.isArray(out.content)) out.content = out.content.map(normalizeNode);

  return out;
}

export const NoteDocSchema = z.preprocess(
  normalizeDoc,
  z
    .object({
      type: z.literal('doc'),
      content: z.array(NodeSchema),
    })
    /*
     * The document's own children must be blocks. A top-level `listItem`, `text`
     * or `inlineMath` is a shape `unionToProse` cannot place — it used to fall
     * through the block switch and emit `undefined` into the editor. Reject it
     * so the repair loop asks for a properly-nested doc.
     */
    .refine(
      (d) => d.content.every((c) => !isInlineNode(c) && !isRecordWithType(c, 'listItem')),
      { error: 'ai.output.topLevelMustBeBlock' },
    )
    /*
     * An empty doc is structurally valid but is never a useful answer — it is
     * what a refusal or a truncated generation looks like. Without this the
     * route returned ok and the user saw a blank preview and an Insert that
     * did nothing. Rejecting spends a repair turn instead.
     */
    .refine((d) => d.content.some(hasRenderableContent), {
      error: 'ai.output.emptyDoc',
    }),
);

/*
 * The text-returning copilot actions (explain / summarize / rephrase /
 * continue / fix_latex). Every provider wraps the answer as `{ text }`, so a
 * model that named the field differently, returned null, or was cut off at the
 * token limit produced `undefined` — which `JSON.stringify` silently drops
 * from the response body, leaving the client with no value to render.
 * Requiring a non-blank string makes that a repairable validation failure.
 */
export const CopilotTextSchema = z.object({
  text: z.string().trim().min(1, 'ai.output.emptyText'),
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

interface ValidateWithRepairOptions {
  provider?: string;
  action?: string;
  noteDoc?: unknown;
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
  options: ValidateWithRepairOptions = {}
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
      // Classify by HTTP status / message so the UI can distinguish rate limits
      // from an invalid key from a real outage instead of showing the opaque
      // "AI provider failed" for all of them. Log the raw error too — an SDK
      // Error inside a plain object logs as `[Error]` and eats the message.
      const code = classifyProviderError(cause);
      console.error('[validateWithRepair] provider threw', {
        provider: options.provider,
        action: options.action,
        attempt: attempt + 1,
        classifiedAs: code,
        error: cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : cause,
      });
      return err(code, cause);
    }

    const parsed = schema.safeParse(raw);
    if (parsed.success) return ok(parsed.data);

    // Log each validation failure for debugging
    const validationErrors = parsed.error.issues.map(i => `${i.path.length ? i.path.join('.') : '<root>'}: ${i.message}`);
    console.warn('[validateWithRepair] Validation failed', {
      provider: options.provider,
      action: options.action,
      attempt: attempt + 1,
      maxAttempts: maxAttempts + 1,
      // Joined, not the raw array: console.warn(obj) renders a nested array as
      // `[Array]` (util.inspect stops at depth 2) and hides every actual issue.
      errors: validationErrors.join(' | '),
      rawPreview: JSON.stringify(raw).slice(0, 2000),
      noteDocPreview: options.noteDoc ? JSON.stringify(options.noteDoc).slice(0, 500) : null,
    });

    lastError = formatZodError(parsed.error);

    // Vary feedback on later attempts to help the model
    if (attempt === maxAttempts - 1) {
      // Second-to-last attempt: provide minimal valid example
      feedback = `Your previous output did not match the required schema:\n${lastError}\n\nMinimal valid example:\n${JSON.stringify(getMinimalValidExample(schema), null, 2)}\n\nReturn corrected JSON only.`;
    } else {
      feedback = `Your previous output did not match the required schema:\n${lastError}\nReturn corrected JSON that satisfies the schema. Output JSON only.`;
    }
  }

  // Log final failure with full context
  console.error('[validateWithRepair] All attempts failed', {
    provider: options.provider,
    action: options.action,
    attempts: maxAttempts + 1,
    lastError,
    lastRawOutput: lastError, // lastError contains the formatted error message
    noteDocPreview: options.noteDoc ? JSON.stringify(options.noteDoc).slice(0, 500) : null,
  });

  return err('ai.invalidOutput', lastError);
}

/**
 * Returns a minimal valid example for the given schema to help models on repair attempts.
 */
function getMinimalValidExample(schema: z.ZodType<unknown>): unknown {
  // Check if it's NoteDocSchema (has type 'doc' with content array)
  // For NoteDoc: return minimal doc with one paragraph
  // For GeneratedCardArraySchema: return minimal card array
  // Fallback: empty object

  const schemaStr = schema.toString();
  if (schemaStr.includes('NoteDoc') || schemaStr.includes('doc')) {
    return {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Content here' }] }
      ]
    };
  }
  if (schemaStr.includes('CardInput') || schemaStr.includes('frontJson')) {
    return [{
      frontJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Question' }] }] },
      backJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Answer' }] }] },
      confidence: 'again',
      position: 0,
    }];
  }
  return {};
}
