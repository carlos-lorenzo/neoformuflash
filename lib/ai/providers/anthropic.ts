/**
 * Anthropic provider using tool use (structured output via tools).
 *
 * Uses the Anthropic SDK with tool definitions matching our schemas.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { NoteDoc, CardInput } from '@neoformuflash/contracts';

interface AnthropicResponse<T> {
  data: T;
  usage: { input_tokens: number; output_tokens: number };
}

const noteDocTool = {
  name: 'output_note_doc',
  description: 'Output a structured NoteDoc for the note',
  input_schema: {
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
  },
} as const;

const cardInputArrayTool = {
  name: 'output_cards',
  description: 'Output an array of CardInput objects',
  input_schema: {
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
  },
} as const;

const textTool = {
  name: 'output_text',
  description: 'Output plain text response',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
    required: ['text'],
    additionalProperties: false,
  },
} as const;

async function callAnthropic<T>(
  systemPrompt: string,
  userPrompt: string,
  tool: typeof noteDocTool | typeof cardInputArrayTool | typeof textTool,
  apiKey: string
): Promise<AnthropicResponse<T>> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [tool as any],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tool_choice: { type: 'tool', name: tool.name } as any,
    temperature: 0.3,
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Anthropic did not return a tool use');
  }

  return {
    data: toolUse.input as T,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

export async function anthropicPdfToNote(
  text: string,
  apiKey: string
): Promise<{ noteDoc: NoteDoc; usage: AnthropicResponse<NoteDoc>['usage'] }> {
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
- Output ONLY valid NoteDoc JSON via the output_note_doc tool`;

  const userPrompt = `Convert this lecture text to a structured NoteDoc:\n\n${text}`;

  const result = await callAnthropic<NoteDoc>(systemPrompt, userPrompt, noteDocTool, apiKey);
  return { noteDoc: result.data, usage: result.usage };
}

export async function anthropicCopilot(
  action: string,
  _noteDoc: NoteDoc | null,
  selectionText: string | null,
  prompt: string | undefined,
  apiKey: string
): Promise<{ result: NoteDoc | string; usage: AnthropicResponse<NoteDoc>['usage'] }> {
  const isGenerate = action === 'generate';
  const tool = isGenerate ? noteDocTool : textTool;

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
Return plain text via the output_text tool (will replace the selection).`;
    userPrompt = `Explain this:\n\n${selectionText}`;
  } else if (action === 'summarize') {
    systemPrompt = `Summarize the selected text concisely for an engineering student.
Keep key concepts and formulas. Use LaTeX math where appropriate.
Return plain text via the output_text tool (will replace the selection).`;
    userPrompt = `Summarize this:\n\n${selectionText}`;
  } else if (action === 'rephrase') {
    systemPrompt = `Rephrase the selected text to be clearer and more concise.
Preserve all mathematical meaning and LaTeX formatting.
Return plain text via the output_text tool (will replace the selection).`;
    userPrompt = `Rephrase this:\n\n${selectionText}`;
  } else if (action === 'continue') {
    systemPrompt = `Continue writing from the selected text naturally.
Match the style, depth, and formatting. Use LaTeX math where appropriate.
Return plain text via the output_text tool (will be appended after the selection).`;
    userPrompt = `Continue from this:\n\n${selectionText}`;
  } else if (action === 'fix_latex') {
    systemPrompt = `Fix any malformed LaTeX in the selected text.
Ensure all inline math uses $...$ and display math uses $$...$$.
Return corrected plain text via the output_text tool (will replace the selection).`;
    userPrompt = `Fix LaTeX in this:\n\n${selectionText}`;
  }

  const result = await callAnthropic<NoteDoc | { text: string }>(
    systemPrompt,
    userPrompt,
    tool,
    apiKey,
  );
  const value = isGenerate
    ? (result.data as NoteDoc)
    : (result.data as { text: string }).text;
  return { result: value, usage: result.usage };
}

export async function anthropicNotesToCards(
  noteDoc: NoteDoc,
  apiKey: string
): Promise<{ cards: CardInput[]; usage: AnthropicResponse<CardInput[]>['usage'] }> {
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
- Output ONLY the CardInput[] array via the output_cards tool`;

  const userPrompt = `Create flashcards from this note:\n\n${JSON.stringify(noteDoc, null, 2)}`;

  const result = await callAnthropic<CardInput[]>(systemPrompt, userPrompt, cardInputArrayTool, apiKey);
  return { cards: result.data, usage: result.usage };
}