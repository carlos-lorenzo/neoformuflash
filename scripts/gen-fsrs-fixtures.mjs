#!/usr/bin/env node
/*
 * Generates packages/contracts/src/__fixtures__/fsrs-golden.json — the
 * committed golden output of `schedule()` (packages/contracts/src/srs.ts)
 * for the fixed rating sequence Good, Good, Again, Good, Easy (AC3).
 *
 * srs.test.ts asserts schedule() reproduces this file exactly. A ts-fsrs
 * bump that changes intervals then fails that test loudly instead of
 * silently rescheduling every user's reviews.
 *
 * Run deliberately, never as part of `pnpm test`:
 *   node scripts/gen-fsrs-fixtures.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schedule } from '../packages/contracts/src/srs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../packages/contracts/src/__fixtures__');
const OUT_FILE = join(OUT_DIR, 'fsrs-golden.json');

const RATINGS = ['good', 'good', 'again', 'good', 'easy'];
const SETTINGS = { desiredRetention: 0.9 };
const START = new Date('2026-01-01T00:00:00.000Z');

let state = null;
let now = START;
const steps = [];

for (const rating of RATINGS) {
  const { next, log } = schedule(state, rating, SETTINGS, now);
  steps.push({
    rating,
    now: now.toISOString(),
    next: {
      stability: next.stability,
      difficulty: next.difficulty,
      phase: next.phase,
      learningSteps: next.learningSteps,
      reps: next.reps,
      lapses: next.lapses,
      dueAt: next.dueAt.toISOString(),
      lastReviewedAt: next.lastReviewedAt ? next.lastReviewedAt.toISOString() : null,
    },
    log: {
      phaseBefore: log.phaseBefore,
      elapsedDays: log.elapsedDays,
      scheduledDays: log.scheduledDays,
      reviewStability: log.reviewStability,
      reviewDifficulty: log.reviewDifficulty,
    },
  });
  state = next;
  now = next.dueAt;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ settings: SETTINGS, start: START.toISOString(), steps }, null, 2) + '\n');

console.log(`wrote ${steps.length} steps to ${OUT_FILE}`);
