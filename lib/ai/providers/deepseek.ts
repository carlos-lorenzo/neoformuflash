/**
 * DeepSeek provider using OpenAI-compatible API with JSON mode.
 *
 * DeepSeek API is OpenAI-compatible at https://api.deepseek.com
 * Uses deepseek-chat model which supports JSON mode (response_format: { type: "json_object" })
 * but NOT the OpenAI beta structured output (json_schema) feature.
 */

import OpenAI from 'openai';
import type { NoteDoc, CardInput } from '@neoformuflash/contracts';

interface DeepSeekResponse<T> {
  data: T;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function callDeepSeek<T>(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<DeepSeekResponse<T>> {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  });

  // Use standard JSON mode (not json_schema which DeepSeek doesn't support)
  const completion = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const choice = completion.choices[0];
  if (!choice?.message) {
    throw new Error('DeepSeek returned no message');
  }
  const content = choice.message.content ?? '';
  if (!content) {
    throw new Error('DeepSeek returned empty content');
  }

  let parsed: T;
  try {
    parsed = JSON.parse(content) as T;
  } catch {
    throw new Error(`DeepSeek returned invalid JSON: ${content.slice(0, 200)}`);
  }

  return {
    data: parsed,
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens ?? 0,
      completion_tokens: completion.usage?.completion_tokens ?? 0,
      total_tokens: completion.usage?.total_tokens ?? 0,
    },
  };
}

// Schema for NoteDoc (included in system prompt for guidance)
export const noteDocSchemaDescription = `The target format is a NoteDoc (Tiptap-compatible JSON) with these node types:
- paragraph, heading (level 1-3), bulletList, orderedList, listItem, blockquote
- codeBlock (with language), inlineMath, displayMath

Rules:
- Use headings for major sections
- Use bullet/ordered lists for enumerations
- Render ALL mathematical expressions as structured nodes:
  * Inline math: { "type": "inlineMath", "latex": "your_latex_here" } (no $ delimiters)
  * Display math: { "type": "displayMath", "latex": "your_latex_here" } (no $$ delimiters)
- Preserve code blocks with appropriate language
- Output ONLY valid NoteDoc JSON

EXACT OUTPUT FORMAT (JSON only, no extra text, no markdown fences):
{
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "Your text here", "marks": {"bold": true} }] },
    { "type": "heading", "level": 2, "content": [{ "type": "text", "text": "Section Title" }] },
    { "type": "bulletList", "content": [
      { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Item 1" }] }] },
      { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Item 2" }] }] }
    ]},
    { "type": "displayMath", "latex": "E=mc^2" },
    { "type": "codeBlock", "language": "python", "content": [{ "type": "text", "text": "print('hello')" }] }
  ]
}

CRITICAL REQUIREMENTS:
- Root MUST be { "type": "doc", "content": [...] }
- Every "text" node MUST have "text" property (string)
- Every "inlineMath"/"displayMath" node MUST have "latex" property (string, no $ delimiters)
- "heading" nodes MUST have "level" (1, 2, or 3)
- "codeBlock" nodes SHOULD have "language" (string or null)
- "marks" on text nodes: object with boolean values, e.g., {"bold": true, "italic": false}
- NO extra properties on nodes (only type, content, text, latex, level, language, marks)`;

export const cardInputArraySchemaDescription = `Generate CardInput objects with:
- frontJson: NoteDoc (question side, can contain math)
- backJson: NoteDoc (answer side, can contain math)
- confidence: ALWAYS "again" (the card hasn't been studied yet)
- position: array index (0, 1, 2...)

Rules:
- One concept per card
- Front: clear question or prompt
- Back: concise answer with formulas where needed
- Use NoteDoc format for both sides (headings, lists, math, code)
- Output ONLY the CardInput[] array

EXACT OUTPUT FORMAT (JSON array only, no extra text, no markdown fences):
[
  {
    "frontJson": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "What is Newton's second law?" }] }] },
    "backJson": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "F = ma" }] }, { "type": "displayMath", "latex": "F = ma" }] },
    "confidence": "again",
    "position": 0
  }
]

CRITICAL REQUIREMENTS:
- Output MUST be a JSON array (starts with [, ends with ])
- Each card MUST have all 4 fields: frontJson, backJson, confidence, position
- frontJson/backJson MUST be valid NoteDoc objects (see NoteDoc format above)
- confidence MUST be exactly "again" (not "hard", "good", "easy")
- position MUST be integer starting from 0`;

export async function deepseekPdfToNote(
  text: string,
  apiKey: string
): Promise<{ noteDoc: NoteDoc; usage: DeepSeekResponse<NoteDoc>['usage'] }> {
  const systemPrompt = `You are an expert at converting raw lecture text into structured notes.
${noteDocSchemaDescription}`;

  const userPrompt = `Convert this lecture text to a structured NoteDoc:\n\n${text}`;

  const result = await callDeepSeek<NoteDoc>(systemPrompt, userPrompt, apiKey);
  return { noteDoc: result.data, usage: result.usage };
}

export async function deepseekCopilot(
  action: string,
  _noteDoc: NoteDoc | null,
  selectionText: string | null,
  prompt: string | undefined,
  apiKey: string,
  materialText?: string | null
): Promise<{ result: NoteDoc | string; usage: DeepSeekResponse<NoteDoc>['usage'] }> {
  const isGenerate = action === 'generate';

  let systemPrompt = '';
  let userPrompt = '';

  // Prepend reference material if provided
  const withMaterial = (base: string) =>
    materialText ? `Reference Material:\n${materialText}\n\n---\n\n${base}` : base;

  if (action === 'generate') {
    systemPrompt = `You are a helpful writing assistant for engineering students.
Generate well-structured note content using the NoteDoc format.
Use headings, lists, code blocks, and LaTeX math (inlineMath/displayMath) where appropriate.
${noteDocSchemaDescription}
The user will insert this at their cursor position.`;
    userPrompt = withMaterial(prompt
      ? `Generate content: ${prompt}`
      : 'Continue writing from the current context.');
    if (selectionText) {
      userPrompt += `\n\nContext (selected text):\n${selectionText}`;
    }
  } else if (action === 'explain') {
    systemPrompt = `You are an expert tutor. Explain the selected text clearly for an engineering student.
Use analogies, break down complex concepts, and include LaTeX math where needed.
Return plain text (will replace the selection).`;
    userPrompt = withMaterial(`Explain this:\n\n${selectionText}`);
  } else if (action === 'summarize') {
    systemPrompt = `Summarize the selected text concisely for an engineering student.
Keep key concepts and formulas. Use LaTeX math where appropriate.
Return plain text (will replace the selection).`;
    userPrompt = withMaterial(`Summarize this:\n\n${selectionText}`);
  } else if (action === 'rephrase') {
    systemPrompt = `Rephrase the selected text to be clearer and more concise.
Preserve all mathematical meaning and LaTeX formatting.
Return plain text (will replace the selection).`;
    userPrompt = withMaterial(`Rephrase this:\n\n${selectionText}`);
  } else if (action === 'continue') {
    systemPrompt = `Continue writing from the selected text naturally.
Match the style, depth, and formatting. Use LaTeX math where appropriate.
Return plain text (will be appended after the selection).`;
    userPrompt = withMaterial(`Continue from this:\n\n${selectionText}`);
  } else if (action === 'fix_latex') {
    systemPrompt = `Fix any malformed LaTeX in the selected text.
Ensure all inline math uses $...$ and display math uses $$...$$.
Return corrected plain text (will replace the selection).`;
    userPrompt = withMaterial(`Fix LaTeX in this:\n\n${selectionText}`);
  }

  const result = await callDeepSeek<NoteDoc | { text: string }>(
    systemPrompt,
    userPrompt,
    apiKey,
  );
  // Non-generate actions return { text }; generate returns a NoteDoc.
  const value = isGenerate
    ? (result.data as NoteDoc)
    : (result.data as { text: string }).text;
  return { result: value, usage: result.usage };
}

export async function deepseekNotesToCards(
  noteDoc: NoteDoc,
  apiKey: string
): Promise<{ cards: CardInput[]; usage: DeepSeekResponse<CardInput[]>['usage'] }> {
  const systemPrompt = `You are an expert at creating flashcards from engineering notes.
${cardInputArraySchemaDescription}`;

  const userPrompt = `Create flashcards from this note:\n\n${JSON.stringify(noteDoc, null, 2)}`;

  const result = await callDeepSeek<CardInput[]>(systemPrompt, userPrompt, apiKey);

  // Log the raw response for debugging
  const cards: CardInput[] = Array.isArray(result.data) ? result.data : [];
  const firstCard = cards[0];
  console.log('[deepseekNotesToCards] Raw response:', {
    cardCount: cards.length,
    firstCard: firstCard ? {
      hasFrontJson: !!firstCard.frontJson,
      hasBackJson: !!firstCard.backJson,
      confidence: firstCard.confidence ?? null,
      position: firstCard.position ?? null,
    } : null,
  });

  return { cards: result.data, usage: result.usage };
}