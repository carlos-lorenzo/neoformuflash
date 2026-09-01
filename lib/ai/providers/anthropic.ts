/**
 * Anthropic provider using tool use (structured output via tools).
 *
 * Uses the Anthropic SDK with tool definitions matching our schemas.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { NoteDoc, CardInput } from '@neoformuflash/contracts';
import { noteDocSchemaDescription, cardInputArraySchemaDescription } from './deepseek';

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

/*
 * Two bugs lived here. `frontJson`/`backJson` were a bare `{type:'object'}`
 * with no properties, so the model had no shape to fill and emitted `{}` for
 * both — every card failed NoteDocSchema with "expected doc". And an Anthropic
 * tool input_schema must be an object, not an array, so the array is wrapped
 * in `{cards:[...]}` and unwrapped after the tool_use call.
 */
const cardInputArrayTool = {
  name: 'output_cards',
  description: 'Output an array of CardInput objects',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            frontJson: noteDocTool.input_schema,
            backJson: noteDocTool.input_schema,
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
  apiKey: string,
  materialText?: string | null
): Promise<{ result: NoteDoc | string; usage: AnthropicResponse<NoteDoc>['usage'] }> {
  const isGenerate = action === 'generate';
  const tool = isGenerate ? noteDocTool : textTool;

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
Return plain text via the output_text tool (will replace the selection).`;
    userPrompt = withMaterial(`Explain this:\n\n${selectionText}`);
  } else if (action === 'summarize') {
    systemPrompt = `Summarize the selected text concisely for an engineering student.
Keep key concepts and formulas. Use LaTeX math where appropriate.
Return plain text via the output_text tool (will replace the selection).`;
    userPrompt = withMaterial(`Summarize this:\n\n${selectionText}`);
  } else if (action === 'rephrase') {
    systemPrompt = `Rephrase the selected text to be clearer and more concise.
Preserve all mathematical meaning and LaTeX formatting.
Return plain text via the output_text tool (will replace the selection).`;
    userPrompt = withMaterial(`Rephrase this:\n\n${selectionText}`);
  } else if (action === 'continue') {
    systemPrompt = `Continue writing from the selected text naturally.
Match the style, depth, and formatting. Use LaTeX math where appropriate.
Return plain text via the output_text tool (will be appended after the selection).`;
    userPrompt = withMaterial(`Continue from this:\n\n${selectionText}`);
  } else if (action === 'fix_latex') {
    systemPrompt = `Fix any malformed LaTeX in the selected text.
Ensure all inline math uses $...$ and display math uses $$...$$.
Return corrected plain text via the output_text tool (will replace the selection).`;
    userPrompt = withMaterial(`Fix LaTeX in this:\n\n${selectionText}`);
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
${cardInputArraySchemaDescription}`;

  const userPrompt = `Create flashcards from this note:\n\n${JSON.stringify(noteDoc, null, 2)}`;

  // The tool input_schema root is `{cards:[...]}` (Anthropic tool schemas
  // must be objects), so unwrap the array before it reaches
  // GeneratedCardArraySchema.
  const result = await callAnthropic<{ cards: CardInput[] }>(systemPrompt, userPrompt, cardInputArrayTool, apiKey);
  const cards: CardInput[] = Array.isArray(result.data?.cards) ? result.data.cards : [];

  const firstCard = cards[0];
  console.log('[anthropicNotesToCards] Raw response:', {
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