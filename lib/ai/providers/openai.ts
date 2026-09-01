/**
 * OpenAI provider using structured output (JSON mode).
 *
 * Requires OpenAI SDK >= 4.0 with beta.chat.completions.parse support.
 */

import OpenAI from 'openai';
import type { NoteDoc, CardInput } from '@neoformuflash/contracts';
import { noteDocSchemaDescription, cardInputArraySchemaDescription } from './deepseek';

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

/*
 * The union is recursive, but json_schema cannot be — so the nesting has to
 * be spelled out to the depth real content actually reaches.
 *
 * This schema used to stop after TWO levels: doc.content held blocks, and
 * every block's `content` was restricted to `['text','inlineMath']`. A list
 * needs FOUR — bulletList > listItem > paragraph > text — so the schema
 * could not describe one. Asked for a bulleted list the model had no legal
 * way to comply and put inline nodes straight under `bulletList`, which is
 * exactly what NoteDocSchema's nesting refinements reject. Every generation
 * containing a list therefore burned all four repair attempts and returned
 * `ai.invalidOutput`. Spelling the levels out lets the model emit a real list.
 *
 * Every level uses the SAME key (`content`) that the union uses, so nothing
 * here needs renaming on the way back — only the permitted `type` values
 * narrow as the nesting deepens.
 */

/** Deepest level — inline leaves only. */
const inlineNodeSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['text', 'inlineMath'] },
    text: { type: 'string' },
    latex: { type: 'string' },
    marks: { type: 'object', additionalProperties: { type: 'boolean' } },
  },
  required: ['type'],
};

/** A listItem's children: real blocks wrapping inline leaves. */
const nestedBlockSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['paragraph', 'heading', 'codeBlock', 'displayMath'] },
    content: { type: 'array', items: inlineNodeSchema },
    text: { type: 'string' },
    latex: { type: 'string' },
    level: { type: 'integer', minimum: 1, maximum: 3 },
    language: { type: ['string', 'null'] },
  },
  required: ['type'],
};

/**
 * A block's children. This is the level that was missing: it must be able to
 * hold a `listItem` (for lists) or a `paragraph` (for blockquotes), not just
 * inline nodes.
 */
const blockChildSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['listItem', 'paragraph', 'text', 'inlineMath'] },
    content: { type: 'array', items: nestedBlockSchema },
    text: { type: 'string' },
    latex: { type: 'string' },
    marks: { type: 'object', additionalProperties: { type: 'boolean' } },
  },
  required: ['type'],
};

const noteDocSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'doc' },
    content: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          // `listItem` is NOT offered at the top level — it is only legal
          // inside a list, and NoteDocSchema rejects it as a doc child.
          type: { type: 'string', enum: ['paragraph', 'heading', 'bulletList', 'orderedList', 'codeBlock', 'blockquote', 'displayMath'] },
          content: { type: 'array', items: blockChildSchema },
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
/*
 * Two bugs lived here. `frontJson`/`backJson` were a bare `{type:'object'}`
 * with no `properties`, so the model had no shape to fill and emitted `{}` —
 * every card failed NoteDocSchema with "expected doc". And a json_schema root
 * must be an object, not an array, so the array is wrapped in `{cards:[...]}`;
 * GeneratedCardArraySchema unwraps that key.
 */
const cardInputArraySchema = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          frontJson: noteDocSchema,
          backJson: noteDocSchema,
          confidence: { type: 'string', enum: ['again', 'hard', 'good', 'easy'] },
          position: { type: 'integer' },
        },
        required: ['frontJson', 'backJson', 'confidence', 'position'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
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
  apiKey: string,
  materialText?: string | null
): Promise<{ result: NoteDoc | string; usage: OpenAIResponse<NoteDoc>['usage'] }> {
  const isGenerate = action === 'generate';
  const schema = isGenerate ? noteDocSchema : { type: 'string' };

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
${cardInputArraySchemaDescription}`;

  const userPrompt = `Create flashcards from this note:\n\n${JSON.stringify(noteDoc, null, 2)}`;

  // The schema root is `{cards:[...]}` (json_schema roots must be objects),
  // so unwrap the array here before it reaches GeneratedCardArraySchema.
  const result = await callOpenAI<{ cards: CardInput[] }>(systemPrompt, userPrompt, cardInputArraySchema, apiKey);
  const cards: CardInput[] = Array.isArray(result.data?.cards) ? result.data.cards : [];

  const firstCard = cards[0];
  console.log('[openaiNotesToCards] Raw response:', {
    cardCount: cards.length,
    firstCard: firstCard ? {
      hasFrontJson: !!firstCard.frontJson,
      hasBackJson: !!firstCard.backJson,
      confidence: firstCard.confidence ?? null,
      position: firstCard.position ?? null,
    } : null,
  });

  return { cards, usage: result.usage };
}