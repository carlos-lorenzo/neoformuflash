/*
 * Editor test helpers: seed a note for a seeded user, and locate the editor
 * surface. The note is inserted through the admin client so each test starts
 * from a known document without depending on the create-note UI.
 *
 * Must stay inside e2e/editor/** (the phase-02 allowlist).
 */

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';

let cachedEnv: Record<string, string> | null = null;

function localEnv(): Record<string, string> {
  if (cachedEnv) return cachedEnv;

  const fromProcess = {
    API_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };

  if (fromProcess.API_URL && fromProcess.SERVICE_ROLE_KEY) {
    cachedEnv = fromProcess;
    return cachedEnv;
  }

  const raw = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  cachedEnv = Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1] as string, match[2] as string])
  );
  return cachedEnv;
}

function adminClient() {
  const env = localEnv();
  return createClient(env.API_URL!, env.SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type SeededNote = {
  id: string;
  title: string;
  cleanup: () => Promise<void>;
};

/** ~5,000 words + 40 equations — the AC9 fixture. */
export function largeDoc(): Record<string, unknown> {
  const words = Array.from({ length: 5000 }, (_, i) => `word${i}`).join(' ');
  const paragraphs = Array.from({ length: 20 }, (_, i) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `Paragraph ${i}. ${words}` }],
  })) as Record<string, unknown>[];

  const equations = Array.from({ length: 40 }, (_, i) => ({
    type: 'displayMath',
    latex: `x^{${i}} + y_{${i}} = z`,
  })) as Record<string, unknown>[];

  // Interleave: paragraph, equation, paragraph, equation…
  const content: Record<string, unknown>[] = [];
  for (let i = 0; i < 40; i += 1) {
    content.push(paragraphs[i] ?? { type: 'paragraph', content: [] });
    content.push(equations[i]);
  }
  content.push(paragraphs[40] ?? { type: 'paragraph', content: [] });

  return { type: 'doc', content };
}

/** Insert a draft note owned by `userId` (draft: published_at null). */
export async function seedNote(
  userId: string,
  title: string,
  contentJson: Record<string, unknown> = { type: 'doc', content: [] },
): Promise<SeededNote> {
  const admin = adminClient();
  const slug = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await admin
    .from('notes')
    .insert({
      owner_id: userId,
      course_id: null,
      slug,
      title,
      content_json: contentJson,
      content_text: '',
      language: 'es',
      visibility: 'public',
    })
    .select('id')
    .single();

  if (error) throw new Error(`note seed failed: ${error.message}`);

  return {
    id: data.id as string,
    title,
    cleanup: async () => {
      await admin.from('notes').delete().eq('id', data.id);
    },
  };
}

/** The ProseMirror editing surface. */
export const editorLocator = (page: Page) => page.locator('.tiptap, .ProseMirror');

/** Wait for the autosave indicator to reach a given state. */
export async function waitForSaveStatus(page: Page, text: 'Saved' | 'Saving' | "Couldn't save"): Promise<void> {
  await page.locator('[aria-live="polite"]').filter({ hasText: text }).waitFor({
    timeout: 5_000,
  });
}

/**
 * Type into the editor and wait a beat for the 800ms autosave debounce plus
 * the server round-trip, so a subsequent reload test sees persisted content.
 */
export async function typeAndSave(page: Page, text: string): Promise<void> {
  await editorLocator(page).click();
  await page.keyboard.type(text);
  await page.waitForTimeout(1_400);
}
