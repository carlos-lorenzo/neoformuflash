// Server Component: static content, no interactivity of its own.
// The action passed in may be a client component; this wrapper need not be.

import { cn } from '@/lib/cn';

/*
 * §7: "Never a blank region with grey text." Every empty state has the ruled-grid
 * signature, one line naming what goes here in the user's own words, and exactly
 * one action. "No notes yet" is explicitly rejected copy; "Your first note starts
 * here" plus a Create note button is the standard.
 *
 * The `action` slot is deliberately singular. A second competing button is how an
 * empty state stops teaching and starts presenting a menu.
 */
export type EmptyStateProps = {
  /** Translated. Names what goes here, in the student's words. */
  title: string;
  /** Translated. One sentence on why it is worth doing. */
  body: string;
  /** Exactly one action. */
  action?: React.ReactNode;
  /** A subdued monochrome wireframe mark. Never a full-colour illustration. */
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, body, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        // The signature (§8): the ruled grid appears behind empty states, the
        // auth screen and the editor margin — nowhere else, never animated.
        'ruled-grid flex flex-col items-center justify-center rounded-md border border-subtle px-6 py-12 text-center',
        className
      )}
    >
      {icon ? <div className="mb-4 text-tertiary">{icon}</div> : null}

      <h2 className="text-ui-lg font-semibold text-primary">{title}</h2>

      {/* Capped so the body never becomes a long single line (refs/04-empty-states). */}
      <p className="mt-2 max-w-measure text-ui-sm text-secondary">{body}</p>

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
