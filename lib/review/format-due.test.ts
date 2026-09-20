import { describe, expect, it } from 'vitest';
import { formatNextDue } from './format-due';

const NOW = new Date('2026-09-20T12:00:00.000Z');

describe('formatNextDue', () => {
  it('renders minutes', () => {
    expect(formatNextDue('2026-09-20T12:10:00.000Z', NOW).relative).toBe('in 10 minutes');
  });

  it('renders hours', () => {
    expect(formatNextDue('2026-09-20T15:00:00.000Z', NOW).relative).toBe('in 3 hours');
  });

  it('renders tomorrow for ~1 day', () => {
    expect(formatNextDue('2026-09-21T12:00:00.000Z', NOW).relative).toBe('tomorrow');
  });

  it('returns now for past dues', () => {
    expect(formatNextDue('2026-09-20T11:00:00.000Z', NOW).relative).toBe('now');
  });
});
