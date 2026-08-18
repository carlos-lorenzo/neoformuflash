/**
 * Scope priority: global → list → editor → review.
 *
 * The active scope is the most specific scope on the stack.
 * Bindings in a more specific scope shadow those in a less specific one
 * for the same key.
 */

export type Scope = 'global' | 'list' | 'editor' | 'review';

export const SCOPE_PRIORITY: Record<Scope, number> = {
  global: 0,
  list: 1,
  editor: 2,
  review: 3,
};

/**
 * A single keyboard binding.
 *
 * `keys` uses the format from specs/shortcuts.md:
 *   - Single key:  '?', '/', 'Escape'
 *   - Modifier:    'mod+k' (mod = ⌘ on mac, Ctrl elsewhere)
 *   - G-prefix:    'g>n' (g followed by n)
 *
 * The provider resolves 'mod' against the platform check at match time.
 */
export type Binding = {
  /** Stable unique id — use `${scope}:${keys}` for static bindings. */
  id: string;
  /** Key expression (see format above). */
  keys: string;
  /** Scope this binding is active in. */
  scope: Scope;
  /** i18n key for the overlay label — resolved at render time. */
  label: string;
  /** Action to run. Null means the binding is documented but not active. */
  onPress: () => void;
  /** True when the binding requires a modifier (⌘/Ctrl/Alt). */
  requireModified: boolean;
  /**
   * Opt into firing while focus is in an input/textarea/contenteditable.
   * Defaults to false — specs/shortcuts.md forbids bare letters in editables.
   * `Escape` is the canonical opt-in: it is not a letter, and a dispatcher
   * that blocks it makes an editor impossible to dismiss by keyboard.
   */
  allowInEditable?: boolean;
};

/**
 * Second-key map for the g-prefix.
 * Keys are the second keystroke (e.g. 'h', 'n'); values are the action.
 */
export type GSecondKeyMap = Record<
  string,
  { label: string; onPress: () => void }
>;
