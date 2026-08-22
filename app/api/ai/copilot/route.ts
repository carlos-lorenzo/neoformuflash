import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getNote } from '@/lib/db/notes';
import { getDecryptedKey } from '@/lib/db/ai-keys';
import { copilot, validateWithRepair, NoteDocSchema } from '@/lib/ai/providers';
import type { Result } from '@/lib/result';
import { CopilotInput } from '@neoformuflash/contracts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Auth
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Parse body
  const body = await req.json();
  const parsed = CopilotInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const { noteId, action, prompt, selectionText, provider } = parsed.data;

  // Verify note ownership
  const noteRes = await getNote(user.id, noteId);
  if (!noteRes.ok) return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
  if (!noteRes.value) return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
  if (noteRes.value.ownerId !== user.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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

  if (isGenerate) {
    result = await validateWithRepair(
      NoteDocSchema,
      async () => {
        const res = await copilot(
          action,
          noteDoc,
          selectionText,
          prompt,
          provider,
          apiKey
        );
        return res.result;
      },
    );
  } else {
    result = await validateWithRepair(
      undefined,
      async () => {
        const res = await copilot(
          action,
          null,
          selectionText,
          prompt,
          provider,
          apiKey
        );
        return { text: res.result };
      },
    );
  }

  if (!result.ok) {
    // Return error codes that clients can map to translations
    // Log the actual cause for debugging (schema validation, provider 4xx/5xx, network, etc.)
    console.error('[copilot] provider error:', result.cause);
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