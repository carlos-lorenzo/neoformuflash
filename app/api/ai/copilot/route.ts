import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getNote } from '@/lib/db/notes';
import { getDecryptedKey } from '@/lib/db/ai-keys';
import { copilot, validateWithRepair, NoteDocSchema, CopilotTextSchema, MAX_REPAIR_ATTEMPTS } from '@/lib/ai/providers';
import { extractPdfText } from '@/lib/ai/pdf';
import type { Result } from '@/lib/result';
import { CopilotInput } from '@neoformuflash/contracts';
import { generateCardsAction } from '@/app/app/notes/[id]/ai/generate-cards/actions';

export const runtime = 'nodejs';

// Attached-material limits. Keep both client- and server-enforced.
const MAX_MATERIAL_BYTES = 10 * 1024 * 1024; // 10 MB — matches pdf-to-note ceiling
const MAX_MATERIAL_CHARS = 50000; // matches CopilotInput.materialText schema cap
const ALLOWED_MATERIAL_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

export async function POST(req: NextRequest) {
  // Auth
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Parse body — accept BOTH JSON (existing callers) and multipart/form-data
  // (new callers that attach a material file). Sniff the Content-Type header.
  const ctHeader = req.headers.get('content' + '-type') ?? '';
  let rawInput: Record<string, unknown>;
  let file: File | null = null;

  if (ctHeader.includes('multipart/form-data')) {
    const formData = await req.formData();
    file = formData.get('file') as File | null;
    // Every other field is a string in FormData — JSON.parse the ones that
    // aren't primitive-string on the schema.
    const payload = formData.get('payload');
    if (typeof payload === 'string') {
      try {
        rawInput = JSON.parse(payload);
      } catch {
        return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
      }
    } else {
      // Fallback: read individual form entries
      rawInput = {
        noteId: formData.get('noteId'),
        action: formData.get('action'),
        prompt: formData.get('prompt') ?? undefined,
        selectionText: formData.get('selectionText') ?? undefined,
        provider: formData.get('provider'),
        target: formData.get('target') ?? undefined,
        deckId: formData.get('deckId') ?? undefined,
        courseId: formData.get('courseId') ?? undefined,
      };
    }
  } else {
    try {
      rawInput = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
  }

  const parsed = CopilotInput.safeParse(rawInput);
  if (!parsed.success) {
    // Without the issue list a 400 here is undebuggable — the client only ever
    // sees the opaque `invalid_input` code.
    console.error('[copilot] invalid input:', parsed.error.issues);
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const { noteId, action, prompt, selectionText, provider, target, deckId, courseId } = parsed.data;

  // Verify note ownership
  const noteRes = await getNote(user.id, noteId);
  if (!noteRes.ok) return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
  if (!noteRes.value) return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
  if (noteRes.value.ownerId !== user.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Handle generate_cards action separately - delegates to existing server action
  if (action === 'generate_cards') {
    const cardsResult = await generateCardsAction({
      noteId,
      courseId: courseId ?? null,
      target: target!,
      deckId,
      provider,
    });

    if (!cardsResult.ok) {
      // Map error codes to client-understandable codes
      const errorCodeMap: Record<string, string> = {
        'ai.noKey': 'ai.noKey',
        'ai.decryptionFailed': 'ai.decryptionFailed',
        'ai.emptyNote': 'ai.emptyNote',
        'content.deck.notFound': 'content.deck.notFound',
        'content.note.notFound': 'note_not_found',
        'error.unauthorized': 'unauthorized',
        'onboarding.invalidInput': 'invalid_input',
      };
      const clientError = errorCodeMap[cardsResult.code] || cardsResult.code;
      return NextResponse.json({ error: clientError }, { status: clientError === 'ai.noKey' ? 400 : 500 });
    }

    return NextResponse.json({
      result: { type: 'deckId', value: cardsResult.value.deckId },
    });
  }

  // Optional attached material: extract text server-side and thread it into
  // the provider prompt. NOT persisted anywhere — the File lives only for the
  // duration of this request.
  let materialText: string | null = parsed.data.materialText ?? null;
  if (file && file.size > 0) {
    if (file.size > MAX_MATERIAL_BYTES) {
      return NextResponse.json({ error: 'ai.material.tooLarge' }, { status: 400 });
    }
    const mime = file.type || '';
    const name = file.name?.toLowerCase() ?? '';
    // Some browsers omit the MIME for .md, so also accept by extension.
    const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
    const isText = mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md');
    if (!isPdf && !isText && !ALLOWED_MATERIAL_MIME.has(mime)) {
      return NextResponse.json({ error: 'ai.material.unsupported' }, { status: 400 });
    }

    try {
      if (isPdf) {
        const pdfResult = await extractPdfText(file);
        if (pdfResult.needsVision) {
          return NextResponse.json({ error: 'ai.material.needsVision' }, { status: 400 });
        }
        materialText = pdfResult.text;
      } else {
        materialText = await file.text();
      }
    } catch (err) {
      console.error('[copilot] material extraction failed:', err);
      return NextResponse.json({ error: 'ai.material.extractionFailed' }, { status: 500 });
    }

    if (!materialText.trim()) {
      return NextResponse.json({ error: 'ai.material.empty' }, { status: 400 });
    }

    // Truncate to schema cap rather than reject — the model still gets a lot
    // of context and the user isn't punished for a slightly-oversized file.
    if (materialText.length > MAX_MATERIAL_CHARS) {
      materialText = materialText.slice(0, MAX_MATERIAL_CHARS);
    }
  }

  const noteDoc = noteRes.value.contentJson;

  // Check if user has a key for this provider
  const keyRes = await getDecryptedKey(user.id, provider);
  if (!keyRes.ok) {
    if (keyRes.code === 'ai.noKey') {
      return NextResponse.json({ error: 'ai.noKey' }, { status: 400 });
    }
    if (keyRes.code === 'ai.decryptionFailed') {
      return NextResponse.json({ error: 'ai.decryptionFailed' }, { status: 500 });
    }
    return NextResponse.json({ error: 'ai.invalidKey' }, { status: 500 });
  }
  const apiKey = keyRes.value;

  // Call provider with validation + repair
  // For generate action, validate against NoteDocSchema
  // For other actions, validate against string (the result is text)
  const isGenerate = action === 'generate';

  let result: Result<unknown>;

  // Fold the repair loop's feedback into the prompt so a second attempt is
  // actually different from the first — copilot() builds its own prompt and has
  // no feedback channel of its own, so without this the loop re-sends identical
  // input and burns every attempt on the same bad output.
  const withFeedback = (base: string | undefined, feedback: string | null): string | undefined =>
    feedback ? `${base ?? ''}\n\n${feedback}`.trim() : base;

  if (isGenerate) {
    result = await validateWithRepair(
      NoteDocSchema,
      async (feedback) => {
        const res = await copilot(
          action,
          noteDoc,
          selectionText ?? null,
          withFeedback(prompt, feedback),
          provider,
          apiKey,
          materialText,
        );
        return res.result;
      },
      MAX_REPAIR_ATTEMPTS,
      { provider, action, noteDoc }
    );
  } else {
    /*
     * The text actions used to pass `undefined` as the schema, which skips
     * validation entirely. Providers extract the answer as
     * `(data as {text:string}).text`, so a model that named the field anything
     * else — or was truncated — yielded `undefined`. `JSON.stringify` then
     * DROPPED the key, so the client received `{result:{type:'text'}}` with no
     * `value` at all: a blank preview, and `mdToNoteDoc(undefined)` throwing on
     * Insert. Validating that the text is a non-empty string turns that silent
     * hole into a repair turn.
     */
    result = await validateWithRepair(
      CopilotTextSchema,
      async (feedback) => {
        const res = await copilot(
          action,
          null,
          selectionText ?? null,
          withFeedback(prompt, feedback),
          provider,
          apiKey,
          materialText,
        );
        return { text: res.result };
      },
      MAX_REPAIR_ATTEMPTS,
      { provider, action }
    );
  }

  if (!result.ok) {
    // Return error codes that clients can map to translations. Nested Error
    // objects print as `[Error]` under console.error(obj) and swallow the
    // message and stack — pull them out explicitly.
    const cause = result.cause;
    const causeDetail = cause instanceof Error
      ? { name: cause.name, message: cause.message, stack: cause.stack }
      : cause;
    console.error('[copilot] provider error:', {
      code: result.code,
      action,
      provider,
      noteId: noteId.slice(0, 8),
      cause: causeDetail,
    });
    return NextResponse.json({ error: result.code }, { status: 500 });
  }

  // Discriminated result matching the client type (copilot-menu.tsx). Without
  // the `type` tag, the client's render branch never matches and it prints
  // String(undefined) → "undefined" while Insert/Replace push undefined into
  // the document.
  const value = isGenerate
    ? result.value
    : (result.value as { text: string }).text;

  return NextResponse.json({
    result: { type: isGenerate ? 'noteDoc' : 'text', value },
  });
}
