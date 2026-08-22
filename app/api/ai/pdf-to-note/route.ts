import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getDecryptedKey, insertAiJob, updateAiJob } from '@/lib/db/ai-keys';
import { extractPdfText } from '@/lib/ai/pdf';
import { pdfToNote, validateWithRepair, NoteDocSchema } from '@/lib/ai/providers';
import { createNoteRowWithContent } from '@/lib/db/notes';
import { PdfToNoteInput } from '@neoformuflash/contracts';
import type { NoteDoc } from '@neoformuflash/contracts';

export const runtime = 'nodejs'; // Required for pdfjs-dist + crypto

export async function POST(req: NextRequest) {
  // Auth
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Parse multipart form
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const courseId = formData.get('courseId') as string | null;
  const title = formData.get('title') as string | null;
  const provider = formData.get('provider') as string | null;

  if (!file || !title || !provider) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Validate input
  const parsed = PdfToNoteInput.safeParse({ courseId, title, provider });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  // Check if user has a key for this provider
  const keyRes = await getDecryptedKey(user.id, parsed.data.provider);
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

  // Extract text from PDF
  let extractedText: string;
  let needsVision: boolean;
  try {
    const pdfResult = await extractPdfText(file);
    extractedText = pdfResult.text;
    needsVision = pdfResult.needsVision;
  } catch {
    return NextResponse.json({ error: 'pdf_extraction_failed' }, { status: 500 });
  }

  if (needsVision) {
    return NextResponse.json({ error: 'needs_vision' }, { status: 400 });
  }

  if (!extractedText.trim()) {
    return NextResponse.json({ error: 'pdf_empty' }, { status: 400 });
  }

  // Create audit job
  const jobRes = await insertAiJob(user.id, 'pdf_to_notes', 'running', null, null, null);
  if (!jobRes.ok) {
    return NextResponse.json({ error: 'job_creation_failed' }, { status: 500 });
  }
  const jobId = jobRes.value.id;

  // Call provider with validation + repair
  const result = await validateWithRepair(
    NoteDocSchema,
    async () => {
      const res = await pdfToNote(extractedText, parsed.data.provider, apiKey);
      return res.noteDoc;
    },
  );

  if (!result.ok) {
    await updateAiJob(jobId, {
      status: 'error',
      error: result.code,
    });
    // Return error codes that clients can map to translations
    return NextResponse.json({ error: result.code }, { status: 500 });
  }

  const noteDoc = result.value as NoteDoc;

  // Extract plain text from NoteDoc for content_text
  const { extractText } = await import('@/lib/editor/serialize');
  const contentText = extractText(noteDoc);

  // Create the note with full content
  const noteRes = await createNoteRowWithContent(user.id, {
    title: parsed.data.title,
    courseId: parsed.data.courseId,
    contentJson: noteDoc,
    contentText,
    language: 'en',
    visibility: 'private',
  });

  if (!noteRes.ok) {
    await updateAiJob(jobId, {
      status: 'error',
      error: 'note_creation_failed',
    });
    return NextResponse.json({ error: 'note_creation_failed' }, { status: 500 });
  }

  await updateAiJob(jobId, {
    status: 'done',
  });

  return NextResponse.json({ noteId: noteRes.value });
}