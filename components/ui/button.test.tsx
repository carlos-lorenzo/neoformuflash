// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';

/*
 * These exist because the loading guard was dead code and nothing noticed.
 *
 * `onClick={loading ? undefined : props.onClick}` sat immediately before
 * `{...props}`, so the spread put the original handler straight back. The bug
 * never surfaced because `aria-disabled:pointer-events-none` stops the click
 * reaching the button at all — the CSS was doing the work the JS claimed to do,
 * and one stylesheet change away from doing neither.
 *
 * `fireEvent`, deliberately, not `userEvent`. userEvent honours pointer-events
 * and would be blocked by the same CSS mask that hid the bug, so it would pass
 * whether or not the guard works — the "passing for the wrong reason" shape
 * that specs/EVOLUTION.md already records twice. fireEvent dispatches the event
 * regardless of CSS, which is what isolates the JS guard.
 */

afterEach(cleanup);

describe('Button', () => {
  it('does not fire onClick while loading, even with the CSS mask bypassed', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire onClick while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('still fires onClick in the ordinary case', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Plain DOM assertions rather than jest-dom matchers: two devDependencies for
  // this file is already the ceiling, and `getAttribute` says the same thing.
  it('stays focusable while loading so submit does not lose the user place', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button');

    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('announces the busy state with its own label when given one', () => {
    render(
      <Button loading loadingLabel="Saving">
        Save
      </Button>
    );

    // The spinner is aria-hidden, so the label is the whole accessible name.
    expect(screen.getByRole('button').textContent).toBe('Saving');
  });
});
