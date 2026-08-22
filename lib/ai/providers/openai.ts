/**
 * OpenAI provider using structured output (JSON mode).
 *
 * Requires OpenAI SDK >= 4.0 with beta.chat.completions.parse support.
 */

import OpenAI from 'openai';
import type { NoteDoc, CardInput } from '@neoformuflash/contracts';

interface OpenAIResponse<T> {
  data: T;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function callOpenAI<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: object,
  apiKey: string
): Promise<OpenAIResponse<T>> {
  const client = new OpenAI({ apiKey });

  // Use structured output (JSON mode) with schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completion = await (client as any).beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06', // Supports structured output
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'structured_output',
        schema,
        strict: true,
      },
    },
    temperature: 0.3,
  });

  const parsed = completion.choices[0].message.parsed;
  if (!parsed) {
    throw new Error('OpenAI returned null parsed output');
  }

  return {
    data: parsed as T,
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens ?? 0,
      completion_tokens: completion.usage?.completion_tokens ?? 0,
      total_tokens: completion.usage?.total_tokens ?? 0,
    },
  };
}

// Schema for NoteDoc (detailed for OpenAI JSON schema structured output)
const noteDocSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'doc' },
    content: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'blockquote', 'displayMath'] },
          content: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['text', 'inlineMath'] },
                text: { type: 'string' },
                latex: { type: 'string' },
                marks: { type: 'object', additionalProperties: { type: 'boolean' } },
              },
              required: ['type'],
            },
          },
          text: { type: 'string' },
          latex: { type: 'string' },
          level: { type: 'integer', minimum: 1, maximum: 3 },
          language: { type: ['string', 'null'] },
        },
        required: ['type'],
      },
    },
  },
  required: ['type', 'content'],
  additionalProperties: false,
};

// Schema for CardInput[]
const cardInputArraySchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      frontJson: { type: 'object' },
      backJson: { type: 'object' },
      confidence: { type: 'string', enum: ['again', 'hard', 'good', 'easy'] },
      position: { type: 'integer' },
    },
    required: ['frontJson', 'backJson', 'confidence', 'position'],
    additionalProperties: false,
  },
};

export async function openaiPdfToNote(
  text: string,
  apiKey: string
): Promise<{ noteDoc: NoteDoc; usage: OpenAIResponse<NoteDoc>['usage'] }> {
  const systemPrompt = `You are an expert at converting raw lecture text into structured notes.
The target format is a NoteDoc (Tiptap-compatible JSON) with these node types:
- paragraph, heading (level 1-3), bulletList, orderedList, listItem, blockquote
- codeBlock (with language), inlineMath, displayMath

Rules:
- Use headings for major sections
- Use bullet/ordered lists for enumerations
- Render ALL mathematical expressions as structured nodes:
  * Inline math: { "type": "inlineMath", "latex": "your_latex_here" } (no $ delimiters)
  * Display math: { "type": "displayMath", "latex": "your_latex_here" } (no $$ delimiters)
- Preserve code blocks with appropriate language
- Output ONLY valid NoteDoc JSON matching the schema`;

  const userPrompt = `Convert this lecture text to a structured NoteDoc:\n\n${text}`;

  const result = await callOpenAI<NoteDoc>(systemPrompt, userPrompt, noteDocSchema, apiKey);
  return { noteDoc: result.data, usage: result.usage };
}

export async function openaiCopilot(
  action: string,
  _noteDoc: NoteDoc | null,
  selectionText: string | null,
  prompt: string | undefined,
  apiKey: string
): Promise<{ result: NoteDoc | string; usage: OpenAIResponse<NoteDoc>['usage'] }> {
  const isGenerate = action === 'generate';
  const schema = isGenerate ? noteDocSchema : { type: 'string' };

  let systemPrompt = '';
  let userPrompt = '';

  if (action === 'generate') {
    systemPrompt = `You are a helpful writing assistant for engineering students.
Generate well-structured note content using the NoteDoc format.
Use headings, lists, code blocks, and LaTeX math (inlineMath/displayMath) where appropriate.
The user will insert this at their cursor position.`;
    userPrompt = prompt
      ? `Generate content: ${prompt}`
      : 'Continue writing from the current context.';
    if (selectionText) {
      userPrompt += `\n\nContext (selected text):\n${selectionText}`;
    }
  } else if (action === 'explain') {
    systemPrompt = `You are an expert tutor. Explain the selected text clearly for an engineering student.
Use analogies, break down complex concepts, and include LaTeX math where needed.
Return plain text (will replace the selection).`;
    userPrompt = `Explain this:\n\n${selectionText}`;
  } else if (action === 'summarize') {
    systemPrompt = `Summarize the selected text concisely for an engineering student.
Keep key concepts and formulas. Use LaTeX math where appropriate.
Return plain text (will replace the selection).`;
    userPrompt = `Summarize this:\n\n${selectionText}`;
  } else if (action === 'rephrase') {
    systemPrompt = `Rephrase the selected text to be clearer and more concise.
Preserve all mathematical meaning and LaTeX formatting.
Return plain text (will replace the selection).`;
    userPrompt = `Rephrase this:\n\n${selectionText}`;
  } else if (action === 'continue') {
    systemPrompt = `Continue writing from the selected text naturally.
Match the style, depth, and formatting. Use LaTeX math where appropriate.
Return plain text (will be appended after the selection).`;
    userPrompt = `Continue from this:\n\n${selectionText}`;
  } else if (action === 'fix_latex') {
    systemPrompt = `Fix any malformed LaTeX in the selected text.
Ensure all inline math uses $...$ and display math uses $$...$$.
Return corrected plain text (will replace the selection).`;
    userPrompt = `Fix LaTeX in this:\n\n${selectionText}`;
  }

  const result = await callOpenAI<NoteDoc | { text: string }>(
    systemPrompt,
    userPrompt,
    schema,
    apiKey,
  );
  // Non-generate actions return { text }; generate returns a NoteDoc.
  const value = isGenerate
    ? (result.data as NoteDoc)
    : (result.data as { text: string }).text;
  return { result: value, usage: result.usage };
}

export async function openaiNotesToCards(
  noteDoc: NoteDoc,
  apiKey: string
): Promise<{ cards: CardInput[]; usage: OpenAIResponse<CardInput[]>['usage'] }> {
  const systemPrompt = `You are an expert at creating flashcards from engineering notes.
Generate CardInput objects with:
- frontJson: NoteDoc (question side, can contain math)
- backJson: NoteDoc (answer side, can contain math)
- confidence: ALWAYS "again" (the card hasn't been studied yet)
- position: array index (0, 1, 2...)

Rules:
- One concept per card
- Front: clear question or prompt
- Back: concise answer with formulas where needed
- Use NoteDoc format for both sides (headings, lists, math, code)
- Output ONLY the CardInput[] array`;

  const userPrompt = `Create flashcards from this note:\n\n${JSON.stringify(noteDoc, null, 2)}`;

  const result = await callOpenAI<CardInput[]>(systemPrompt, userPrompt, cardInputArraySchema, apiKey);
  return { cards: result.data, usage: result.usage };
}