/**
 * Unified provider dispatcher.
 *
 * All three providers implement the same three functions with identical
 * signatures. This module picks the right one based on `provider` from the
 * `ai_provider` enum (frozen in contracts).
 */

import type { AiProvider } from '@neoformuflash/contracts';
import type { NoteDoc, CardInput } from '@neoformuflash/contracts';
import * as openai from './openai';
import * as anthropic from './anthropic';
import * as google from './google';
import * as deepseek from './deepseek';
import { validateWithRepair, NoteDocSchema, CopilotTextSchema, GeneratedCardArraySchema, type GeneratedCard, MAX_REPAIR_ATTEMPTS } from '@/lib/ai/validate-output';

export interface PdfToNoteResult {
  noteDoc: NoteDoc;
  usage: { input_tokens: number; output_tokens: number };
}

export interface CopilotResult {
  result: NoteDoc | string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface NotesToCardsResult {
  cards: CardInput[];
  usage: { input_tokens: number; output_tokens: number };
}

// Re-export validation utilities
export { validateWithRepair, NoteDocSchema, CopilotTextSchema, GeneratedCardArraySchema, type GeneratedCard, MAX_REPAIR_ATTEMPTS };

function getProviderError(provider: AiProvider): never {
  throw new Error(`Unknown provider: ${provider}`);
}

export async function pdfToNote(
  text: string,
  provider: AiProvider,
  apiKey: string
): Promise<PdfToNoteResult> {
  switch (provider) {
    case 'openai': {
      const r = await openai.openaiPdfToNote(text, apiKey);
      return { noteDoc: r.noteDoc, usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens } };
    }
    case 'anthropic': {
      const r = await anthropic.anthropicPdfToNote(text, apiKey);
      return { noteDoc: r.noteDoc, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens } };
    }
    case 'google': {
      const r = await google.googlePdfToNote(text, apiKey);
      return { noteDoc: r.noteDoc, usage: { input_tokens: r.usage.promptTokenCount, output_tokens: r.usage.candidatesTokenCount } };
    }
    case 'deepseek': {
      const r = await deepseek.deepseekPdfToNote(text, apiKey);
      return { noteDoc: r.noteDoc, usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens } };
    }
    default:
      return getProviderError(provider);
  }
}

export async function copilot(
  action: string,
  noteDoc: NoteDoc | null,
  selectionText: string | null,
  prompt: string | undefined,
  provider: AiProvider,
  apiKey: string,
  materialText?: string | null
): Promise<CopilotResult> {
  switch (provider) {
    case 'openai': {
      const r = await openai.openaiCopilot(action, noteDoc, selectionText, prompt, apiKey, materialText);
      return { result: r.result, usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens } };
    }
    case 'anthropic': {
      const r = await anthropic.anthropicCopilot(action, noteDoc, selectionText, prompt, apiKey, materialText);
      return { result: r.result, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens } };
    }
    case 'google': {
      const r = await google.googleCopilot(action, noteDoc, selectionText, prompt, apiKey, materialText);
      return { result: r.result, usage: { input_tokens: r.usage.promptTokenCount, output_tokens: r.usage.candidatesTokenCount } };
    }
    case 'deepseek': {
      const r = await deepseek.deepseekCopilot(action, noteDoc, selectionText, prompt, apiKey, materialText);
      return { result: r.result, usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens } };
    }
    default:
      return getProviderError(provider);
  }
}

export async function notesToCards(
  noteDoc: NoteDoc,
  provider: AiProvider,
  apiKey: string
): Promise<NotesToCardsResult> {
  switch (provider) {
    case 'openai': {
      const r = await openai.openaiNotesToCards(noteDoc, apiKey);
      return { cards: r.cards, usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens } };
    }
    case 'anthropic': {
      const r = await anthropic.anthropicNotesToCards(noteDoc, apiKey);
      return { cards: r.cards, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens } };
    }
    case 'google': {
      const r = await google.googleNotesToCards(noteDoc, apiKey);
      return { cards: r.cards, usage: { input_tokens: r.usage.promptTokenCount, output_tokens: r.usage.candidatesTokenCount } };
    }
    case 'deepseek': {
      const r = await deepseek.deepseekNotesToCards(noteDoc, apiKey);
      return { cards: r.cards, usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens } };
    }
    default:
      return getProviderError(provider);
  }
}