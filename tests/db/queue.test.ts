import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCard, createCardState, createDeck, createTestUser, deleteTestUser, type TestUser } from '../fixtures/seed';

/*
 * AC17 — the queue query for "cards due for user U in deck D" (the first
 * branch of the lazy-union documented in specs/phase-01-contracts.md) must
 * use card_states_queue_idx, proven by explain analyze rather than assumed.
 */

let owner: TestUser;

beforeAll(async () => {
  owner = await createTestUser('queue-owner');
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
});

describe('queue query uses card_states_queue_idx (AC17)', () => {
  it('the due-states branch of the queue plans through the index', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id);
    await createCardState(owner.id, card, { due_at: new Date('2020-01-01T00:00:00.000Z').toISOString() });

    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
    await client.connect();
    try {
      // The planner's choice depends on card_states being a realistic size: on
      // an empty table a seq scan legitimately wins the cost model and the
      // test fails against fresh databases (db:reset, CI's supabase start).
      // Bulk-seed a few thousand states so the index path is deterministically
      // cheaper, then ANALYZE so the estimates see the real row count.
      await client.query('begin');
      await client.query(
        `insert into cards (deck_id, front_json, back_json, front_text, back_text, position)
         select $1, '{"type":"doc","content":[]}'::jsonb, '{"type":"doc","content":[]}'::jsonb,
                'bulk', 'bulk', g
         from generate_series(1, 2000) g`,
        [deck.id]
      );
      await client.query(
        `insert into card_states (user_id, card_id, deck_id, due_at)
         select $1, id, $2, '2020-01-01'::timestamptz
         from cards where deck_id = $2 and position > 0`,
        [owner.id, deck.id]
      );
      await client.query('commit');
      await client.query('analyze card_states');

      const { rows } = await client.query(
        `explain analyze
         select c.id, cs.due_at
           from card_states cs
           join cards c on c.id = cs.card_id
          where cs.user_id = $1 and cs.deck_id = $2 and cs.due_at <= now()
          order by cs.due_at
          limit $3`,
        [owner.id, deck.id, 20]
      );
      const plan = rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n');
      expect(plan).toContain('card_states_queue_idx');
    } finally {
      await client.end();
    }
  });
});
