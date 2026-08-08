import { describe, expect, it } from 'vitest';
import { formatInterval } from './format-interval';

describe('formatInterval', () => {
  it('renders sub-minute as <1 min', () => {
    expect(formatInterval(0)).toBe('<1 min');
    expect(formatInterval(0.0001)).toBe('<1 min');
  });

  it('renders learning-step minutes', () => {
    // 1 min ≈ 0.000694d → rounds to 1
    expect(formatInterval(1 / 1440)).toBe('1 min');
    // 10 min ≈ 0.00694d → rounds to 10
    expect(formatInterval(10 / 1440)).toBe('10 min');
    // 15 min
    expect(formatInterval(15 / 1440)).toBe('15 min');
  });

  it('renders hours for intervals < 1 day', () => {
    expect(formatInterval(0.5)).toBe('12h');
    expect(formatInterval(1 / 3)).toBe('8h');
  });

  it('renders days for intervals < 30 days', () => {
    expect(formatInterval(1)).toBe('1 d');
    expect(formatInterval(2)).toBe('2 d');
    expect(formatInterval(14)).toBe('14 d');
    expect(formatInterval(29)).toBe('29 d');
  });

  it('renders weeks for intervals < 365 days', () => {
    expect(formatInterval(30)).toBe('4 w');
    expect(formatInterval(60)).toBe('9 w');
    expect(formatInterval(364)).toBe('52 w');
  });

  it('renders years for intervals >= 365 days', () => {
    expect(formatInterval(365)).toBe('1 y');
    expect(formatInterval(730)).toBe('2 y');
    expect(formatInterval(365 * 4)).toBe('4 y');
  });

  it('handles non-finite and negative inputs gracefully', () => {
    expect(formatInterval(NaN)).toBe('<1 min');
    expect(formatInterval(Infinity)).toBe('<1 min');
    expect(formatInterval(-1)).toBe('<1 min');
  });
});
