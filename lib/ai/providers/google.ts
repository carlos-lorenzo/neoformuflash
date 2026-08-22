/**
 * Google (Gemini) provider using structured output (responseSchema).
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { NoteDoc, CardInput } from '@neoformuflash/contracts';

interface GoogleResponse<T> {
  data: T;
  usage: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}

const noteDocSchema = {
  type: SchemaType.OBJECT,
  properties: {
    type: { type: SchemaType.STRING, enum: ['doc'], format: 'enum' },
    content: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, enum: ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'blockquote', 'displayMath'], format: 'enum' },
          content: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                type: { type: SchemaType.STRING, enum: ['text', 'inlineMath'], format: 'enum' },
                text: { type: SchemaType.STRING },
                latex: { type: SchemaType.STRING },
                // marks removed - not supported in Gemini responseSchema (empty OBJECT with additionalProperties is invalid)
              },
              required: ['type'],
            },
          },
          text: { type: SchemaType.STRING },
          latex: { type: SchemaType.STRING },
          level: { type: SchemaType.INTEGER },
          language: { type: SchemaType.STRING, nullable: true },
        },
        // content is required for block nodes that have children (not displayMath)
        required: ['type'],
      },
    },
  },
  required: ['type', 'content'],
};

const cardInputArraySchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      frontJson: { type: SchemaType.OBJECT },
      backJson: { type: SchemaType.OBJECT },
      confidence: { type: SchemaType.STRING, enum: ['again', 'hard', 'good', 'easy'], format: 'enum' },
      position: { type: SchemaType.INTEGER },
    },
    required: ['frontJson', 'backJson', 'confidence', 'position'],
  },
};

const textSchema = {
  type: SchemaType.OBJECT,
  properties: {
    text: { type: SchemaType.STRING },
  },
  required: ['text'],
};

async function callGoogle<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: typeof noteDocSchema | typeof cardInputArraySchema | typeof textSchema,
  apiKey: string
): Promise<GoogleResponse<T>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: schema as any,
      temperature: 0.3,
    },
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  if (!text) {
    throw new Error('Google returned empty response');
  }

  const parsed = JSON.parse(text);
  return {
    data: parsed as T,
    usage: {
      promptTokenCount: result.response.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: result.response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokenCount: result.response.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

export async function googlePdfToNote(
  text: string,
  apiKey: string
): Promise<{ noteDoc: NoteDoc; usage: GoogleResponse<NoteDoc>['usage'] }> {
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
- Output ONLY valid NoteDoc JSON`;

  const userPrompt = `Convert this lecture text to a structured NoteDoc:\n\n${text}`;

  const result = await callGoogle<NoteDoc>(systemPrompt, userPrompt, noteDocSchema, apiKey);
  return { noteDoc: result.data, usage: result.usage };
}

export async function googleCopilot(
  action: string,
  _noteDoc: NoteDoc | null,
  selectionText: string | null,
  prompt: string | undefined,
  apiKey: string
): Promise<{ result: NoteDoc | string; usage: GoogleResponse<NoteDoc>['usage'] }> {
  const isGenerate = action === 'generate';
  const schema = isGenerate ? noteDocSchema : textSchema;

  let systemPrompt = '';
  let userPrompt = '';

  if (action === 'generate') {
    systemPrompt = `You are a helpful writing assistant for engineering students.
Generate well-structured note content using the NoteDoc format.
Use headings, lists, code blocks, and LaTeX math (inlineMath/displayMath) where appropriate.
For math expressions, use structured nodes:
- Inline math: { "type": "inlineMath", "latex": "your_latex_here" }
- Display math: { "type": "displayMath", "latex": "your_latex_here" }
(NO $ or $$ delimiters - just the raw LaTeX inside the latex field)
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

  const result = await callGoogle<NoteDoc | { text: string }>(
    systemPrompt,
    userPrompt,
    schema,
    apiKey,
  );
  const value = isGenerate
    ? (result.data as NoteDoc)
    : (result.data as { text: string }).text;
  return { result: value, usage: result.usage };
}

export async function googleNotesToCards(
  noteDoc: NoteDoc,
  apiKey: string
): Promise<{ cards: CardInput[]; usage: GoogleResponse<CardInput[]>['usage'] }> {
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

  const result = await callGoogle<CardInput[]>(systemPrompt, userPrompt, cardInputArraySchema, apiKey);
  return { cards: result.data, usage: result.usage };
}