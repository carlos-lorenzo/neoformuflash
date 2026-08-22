/**
 * PDF text extraction with vision fallback detection.
 *
 * Uses pdfjs-dist (dynamic import to avoid bundling in review route).
 * Returns extracted text + needsVision flag.
 *
 * needsVision = true when:
 *   - No text could be extracted (scanned PDF)
 *   - Extracted text is < 50 chars after trim (likely scanned/empty)
 *   - Text contains no alphanumeric runs (gibberish)
 *
 * The vision branch is STUBBED this phase — the dispatch logic is real,
 * but the actual vision call throws 'not implemented'.
 */

const MIN_TEXT_CHARS = 50;
const ALPHANUMERIC_RUN_REGEX = /[a-zA-Z0-9]{10,}/;

export async function extractPdfText(
  file: File | Buffer | Uint8Array
): Promise<{ text: string; needsVision: boolean }> {
  // Dynamic import to keep bundle size down and avoid Edge runtime issues
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdf.js needs a worker; in Node we can use the built-in one
  if (typeof window === 'undefined') {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjs.GlobalWorkerOptions.workerSrc = worker as any;
  }

  let data: Uint8Array;
  if (file instanceof File) {
    data = new Uint8Array(await file.arrayBuffer());
  } else if (file instanceof Buffer) {
    data = new Uint8Array(file);
  } else {
    data = file;
  }

  const pdf = await pdfjs.getDocument({ data }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  const trimmed = fullText.trim();
  const hasAlnumRun = ALPHANUMERIC_RUN_REGEX.test(trimmed);

  const needsVision = trimmed.length < MIN_TEXT_CHARS || !hasAlnumRun;

  return { text: trimmed, needsVision };
}

/**
 * Stubbed vision extraction — throws 'not implemented'.
 * Phase 06+ will implement by sending PDF pages as images to a vision-capable model.
 */
export async function extractPdfVision(
  _file: File | Buffer | Uint8Array
): Promise<{ text: string; needsVision: false }> {
  throw new Error('Vision extraction not implemented — coming in phase 06');
}