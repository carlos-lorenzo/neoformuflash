import { describe, expect, it } from 'vitest';
import { schedule, type Rating, type SchedulingSettings, type SrsState } from './srs';
import golden from './__fixtures__/fsrs-golden.json';

/*
 * AC3: schedule() must reproduce the committed golden fixtures exactly for
 * the fixed rating sequence Good, Good, Again, Good, Easy. Regenerate via
 * `node scripts/gen-fsrs-fixtures.mjs` — never hand-edit the fixture.
 */
describe('schedule (FSRS golden fixtures)', () => {
  it('reproduces the committed fixture step by step', () => {
    const settings: SchedulingSettings = golden.settings;
    let state: SrsState | null = null;
    let now = new Date(golden.start);

    for (const step of golden.steps) {
      expect(now.toISOString()).toBe(step.now);

      const { next, log } = schedule(state, step.rating as Rating, settings, now);

      expect(next.stability).toBe(step.next.stability);
      expect(next.difficulty).toBe(step.next.difficulty);
      expect(next.phase).toBe(step.next.phase);
      expect(next.learningSteps).toBe(step.next.learningSteps);
      expect(next.reps).toBe(step.next.reps);
      expect(next.lapses).toBe(step.next.lapses);
      expect(next.dueAt.toISOString()).toBe(step.next.dueAt);
      expect(next.lastReviewedAt?.toISOString() ?? null).toBe(step.next.lastReviewedAt);

      expect(log.phaseBefore).toBe(step.log.phaseBefore);
      expect(log.elapsedDays).toBe(step.log.elapsedDays);
      expect(log.scheduledDays).toBe(step.log.scheduledDays);
      expect(log.reviewStability).toBe(step.log.reviewStability);
      expect(log.reviewDifficulty).toBe(step.log.reviewDifficulty);

      state = next;
      now = next.dueAt;
    }
  });
});
