/*
 * Review-session test helpers: seed a deck with cards for a seeded user
 * through the admin client, so each test starts from a known queue without
 * depending on the deck/card creation UI.
 *
 * Must stay inside e2e/review/**.
 */

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

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

export type SeededDeck = {
  id: string;
  cards: string[];
  cleanup: () => Promise<void>;
};

/** A minimal NoteDoc paragraph. */
function para(text: string): Record<string, unknown> {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

/** A display equation in the NoteDoc form used by the editor/reader. */
function equation(latex: string): Record<string, unknown> {
  return {
    type: 'mathDisplay',
    attrs: { latex },
    content: [],
  };
}

/**
 * Seed a deck owned by `userId` with `count` new cards. Each card has plain
 * text on the front and a mix of text + a display equation on the back, so
 * both the card surface and the grading row render real content.
 */
export async function seedDeckWithCards(
  userId: string,
  count: number,
): Promise<SeededDeck> {
  const admin = adminClient();
  const slug = `e2e-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: deck, error: deckError } = await admin
    .from('decks')
    .insert({
      owner_id: userId,
      slug,
      title: 'Review deck',
      visibility: 'public',
    })
    .select('id')
    .single();
  if (deckError) throw new Error(`deck seed failed: ${deckError.message}`);

  const cardIds: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const front = { type: 'doc', content: [para(`Front of card ${i}`)] };
    const back = {
      type: 'doc',
      content: [para(`Answer for card ${i}`), equation(`E = mc^2 + ${i}`)],
    };

    const { data: card, error: cardError } = await admin
      .from('cards')
      .insert({
        deck_id: deck.id,
        front_json: front,
        back_json: back,
        front_text: `Front of card ${i}`,
        back_text: `Answer for card ${i}`,
        position: i,
        confidence: null,
      })
      .select('id')
      .single();
    if (cardError) throw new Error(`card seed failed: ${cardError.message}`);
    cardIds.push(card.id as string);
  }

  return {
    id: deck.id as string,
    cards: cardIds,
    cleanup: async () => {
      await admin.from('cards').delete().eq('deck_id', deck.id);
      await admin.from('decks').delete().eq('id', deck.id);
    },
  };
}
