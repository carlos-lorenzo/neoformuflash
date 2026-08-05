#!/usr/bin/env node
/*
 * Populates the local Supabase stack with browsable dev data: two users (one
 * pro, one free), courses/notes across all three visibilities, decks, cards,
 * a subscription, and realistic volume — a 500-card deck, a 5,000-word note,
 * and 90 days of review history on a subscribed deck (generated with the real
 * schedule() so the history looks like an actual FSRS trajectory, not
 * hand-picked numbers).
 *
 * Connection details come from the running CLI (`supabase status -o env`),
 * same convention as tests/setup/supabase-env.ts — never a committed .env
 * file. Requires the local stack to be up and freshly reset.
 *
 * Run deliberately, never as part of `pnpm test`:
 *   pnpm db:reset && node scripts/seed-dev.mjs
 */

import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { schedule } from '../packages/contracts/src/srs.ts';

function readLocalStackEnv() {
  const raw = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]])
  );
}

let env;
try {
  env = readLocalStackEnv();
} catch {
  throw new Error('The local Supabase stack is not running. Start it with `pnpm db:start`.');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.API_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createUser(label, { pro }) {
  const email = `${label}@example.test`;
  const password = 'dev-password-not-a-secret';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`could not create user ${label}: ${error?.message}`);

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, slug: label, handle: label, display_name: label, is_pro: pro });
  if (profileError) throw new Error(`could not seed profile for ${label}: ${profileError.message}`);

  return { id: data.user.id, email };
}

function paragraph(text) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function longNoteDoc(wordTarget) {
  const sentence =
    'The Fourier transform decomposes a signal into the frequencies that make it up, and this exact property is what makes it indispensable across signal processing, quantum mechanics and image compression.';
  const wordsPerSentence = sentence.split(' ').length;
  const sentencesNeeded = Math.ceil(wordTarget / wordsPerSentence);
  const content = [{ type: 'heading', level: 1, content: [{ type: 'text', text: 'Fourier analysis — study notes' }] }];
  for (let i = 0; i < sentencesNeeded; i += 1) {
    if (i % 12 === 0) {
      content.push({ type: 'heading', level: 2, content: [{ type: 'text', text: `Section ${i / 12 + 1}` }] });
    }
    content.push(paragraph(`${sentence} (paragraph ${i + 1})`));
  }
  return { type: 'doc', content };
}

function extractText(doc) {
  return doc.content
    .map((node) => {
      if (node.type === 'paragraph' || node.type === 'heading') {
        return node.content.map((n) => n.text).join('');
      }
      return '';
    })
    .join('\n');
}

function cardDoc(text) {
  return { type: 'doc', content: [paragraph(text)] };
}

async function main() {
  console.log('Seeding dev data...');

  const pro = await createUser('dev-pro', { pro: true });
  const free = await createUser('dev-free', { pro: false });
  console.log(`created users: ${pro.email} (pro), ${free.email} (free)`);

  const { data: publicCourse, error: publicCourseError } = await admin
    .from('courses')
    .insert({ owner_id: pro.id, slug: 'signal-processing', name: 'Signal Processing', visibility: 'public' })
    .select()
    .single();
  if (publicCourseError) throw new Error(`could not create public course: ${publicCourseError.message}`);

  const { error: unlistedCourseError } = await admin
    .from('courses')
    .insert({ owner_id: pro.id, slug: 'unlisted-course', name: 'Unlisted Course', visibility: 'unlisted' })
    .select()
    .single();
  if (unlistedCourseError) throw new Error(`could not create unlisted course: ${unlistedCourseError.message}`);

  const { error: privateCourseError } = await admin
    .from('courses')
    .insert({ owner_id: pro.id, slug: 'private-course', name: 'Private Course', visibility: 'private' })
    .select()
    .single();
  if (privateCourseError) throw new Error(`could not create private course: ${privateCourseError.message}`);

  const longDoc = longNoteDoc(5000);
  const { error: noteError } = await admin.from('notes').insert([
    {
      owner_id: pro.id,
      course_id: publicCourse.id,
      slug: 'fourier-analysis',
      title: 'Fourier analysis',
      content_json: longDoc,
      content_text: extractText(longDoc),
      visibility: 'public',
      published_at: new Date().toISOString(),
    },
    {
      owner_id: pro.id,
      slug: 'unlisted-note',
      title: 'Unlisted note',
      content_json: cardDoc('Reachable by id only.'),
      content_text: 'Reachable by id only.',
      visibility: 'unlisted',
      published_at: new Date().toISOString(),
    },
    {
      owner_id: pro.id,
      slug: 'private-note',
      title: 'Private note',
      content_json: cardDoc('Owner-only.'),
      content_text: 'Owner-only.',
      visibility: 'private',
      published_at: new Date().toISOString(),
    },
    {
      owner_id: free.id,
      slug: 'free-user-note',
      title: 'Free user note',
      content_json: cardDoc('Written by the free user.'),
      content_text: 'Written by the free user.',
      visibility: 'public',
      published_at: new Date().toISOString(),
    },
  ]);
  if (noteError) throw new Error(`could not create notes: ${noteError.message}`);
  console.log('created courses (public/unlisted/private) and notes');

  const { data: bigDeck, error: bigDeckError } = await admin
    .from('decks')
    .insert({
      owner_id: pro.id,
      course_id: publicCourse.id,
      slug: 'fourier-500',
      title: 'Fourier analysis — 500 cards',
      visibility: 'public',
    })
    .select()
    .single();
  if (bigDeckError) throw new Error(`could not create big deck: ${bigDeckError.message}`);

  const CARD_COUNT = 500;
  const cardRows = Array.from({ length: CARD_COUNT }, (_, i) => ({
    deck_id: bigDeck.id,
    front_json: cardDoc(`Term ${i + 1}: what is it?`),
    back_json: cardDoc(`Definition of term ${i + 1}.`),
    front_text: `Term ${i + 1}: what is it?`,
    back_text: `Definition of term ${i + 1}.`,
    position: i,
  }));
  const { data: cards, error: cardsError } = await admin.from('cards').insert(cardRows).select('id');
  if (cardsError) throw new Error(`could not create cards: ${cardsError.message}`);
  console.log(`created deck "${bigDeck.title}" with ${cards.length} cards`);

  const { error: privateDeckError } = await admin
    .from('decks')
    .insert({ owner_id: pro.id, slug: 'private-deck', title: 'Private deck', visibility: 'private' });
  if (privateDeckError) throw new Error(`could not create private deck: ${privateDeckError.message}`);

  const { error: subError } = await admin.from('deck_subscriptions').insert({ user_id: free.id, deck_id: bigDeck.id });
  if (subError) throw new Error(`could not subscribe free user to deck: ${subError.message}`);
  console.log(`subscribed ${free.email} to "${bigDeck.title}"`);

  // 90 days of review history: one review per day on each of the first 20
  // cards of the big deck, for the subscriber. schedule() drives realistic
  // stability/difficulty/due_at progression rather than hand-picked values.
  const REVIEW_CARD_COUNT = 20;
  const DAYS = 90;
  const SETTINGS = { desiredRetention: 0.9 };
  const RATINGS = ['good', 'good', 'good', 'hard', 'good', 'easy', 'again'];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - DAYS);

  for (let c = 0; c < REVIEW_CARD_COUNT; c += 1) {
    const card = cards[c];
    let state = null;
    const cardStateRows = [];
    const reviewLogRows = [];

    for (let day = 0; day < DAYS; day += 1) {
      const now = new Date(start);
      now.setUTCDate(now.getUTCDate() + day);
      const rating = RATINGS[(c + day) % RATINGS.length];

      const { next, log } = schedule(state, rating, SETTINGS, now);
      state = next;

      reviewLogRows.push({
        user_id: free.id,
        card_id: card.id,
        rating,
        phase: log.phaseBefore,
        elapsed_days: log.elapsedDays,
        scheduled_days: log.scheduledDays,
        review_stability: log.reviewStability,
        review_difficulty: log.reviewDifficulty,
        reviewed_at: now.toISOString(),
      });
    }

    cardStateRows.push({
      user_id: free.id,
      card_id: card.id,
      deck_id: bigDeck.id,
      stability: state.stability,
      difficulty: state.difficulty,
      phase: state.phase,
      learning_steps: state.learningSteps,
      reps: state.reps,
      lapses: state.lapses,
      due_at: state.dueAt.toISOString(),
      last_reviewed_at: state.lastReviewedAt ? state.lastReviewedAt.toISOString() : null,
    });

    const { error: logsError } = await admin.from('review_logs').insert(reviewLogRows);
    if (logsError) throw new Error(`could not insert review_logs for card ${card.id}: ${logsError.message}`);

    const { error: stateError } = await admin.from('card_states').insert(cardStateRows);
    if (stateError) throw new Error(`could not insert card_states for card ${card.id}: ${stateError.message}`);
  }
  console.log(`generated ${DAYS} days of review history on ${REVIEW_CARD_COUNT} cards for ${free.email}`);

  console.log('\nSeed complete. Browse in Supabase Studio.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
