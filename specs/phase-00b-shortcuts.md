# Phase 00b — Keyboard shortcut infrastructure

## Goal and why
A small amendment to the shipped foundation. Phases 02, 03 and 04 run in parallel and **all three need a shortcut dispatcher and a `Kbd` component on day one.** If this lands inside phase 02 instead, the other two worktrees either block on it or build their own, which is exactly the collision `specs/shortcuts.md` exists to prevent.

Half a day. Do not let it grow.

## Not in this phase
The command palette. Any actual bindings beyond the global set — `c`, `e`, `s`, `j/k` and the review keys belong to the phases that own those screens. This phase ships the mechanism and the navigation tier only.

## Contract changes
`profiles.keyboard_shortcuts_enabled` — already in the phase 01 migration. No new schema.

## Component inventory
| Component | File | Client/Server | States |
|---|---|---|---|
| `ShortcutProvider` | `lib/shortcuts/provider.tsx` | client | scope stack, `g`-prefix pending, disabled |
| `useShortcut` | `lib/shortcuts/use-shortcut.ts` | client | registered, unregistered on unmount |
| `Kbd` | `components/ui/kbd.tsx` | server | single key, combination, mac vs non-mac |
| `ShortcutOverlay` | `components/shortcut-overlay.tsx` | client | open, closed, scoped to current screen |

## Acceptance criteria
1. Every binding in the "Global" table of `specs/shortcuts.md` works, and no binding outside it does.
2. `g` opens a 1.5s second-key window with a visible indicator; an unmapped second key cancels silently; a third press does nothing.
3. **No bare-letter shortcut fires while focus is in an `input`, `textarea`, `select` or `contenteditable`.** Test by typing `gncse` into a text field and asserting the value is `gncse` and the route never changed.
4. `?` opens an overlay listing only the shortcuts active in the current scope.
5. Setting `keyboard_shortcuts_enabled = false` disables bare-letter bindings and leaves modifier combinations working.
6. `Kbd` renders `⌘` on macOS and `Ctrl` elsewhere from one platform check, not per call site.
7. Matching uses `event.key`. Verified under an emulated Spanish layout: `?`, `/` and the digits all resolve correctly.
8. Unmounting a screen unregisters its bindings — navigate away and back twenty times, assert no duplicate handlers.

## Verification
- `pnpm typecheck && pnpm lint && pnpm lint:tokens && pnpm build && pnpm test`
- Playwright: `shortcuts-navigation`, `shortcuts-input-suppression`, `shortcuts-overlay`, `shortcuts-disabled-setting`
- Screenshots: `?` overlay, a menu with trailing hints, an empty state with a hint → `design-critic`
- Reviewers: test-runner, design-critic, code-reviewer

## Files I may touch
`lib/shortcuts/**`, `components/ui/kbd.tsx`, `components/shortcut-overlay.tsx`, `components/layout/app-shell.tsx`, `e2e/shortcuts/**`.

## Risks and open questions
- The dispatcher is the one piece of global mutable state in the app. Keep it a single provider with a scope stack; resist per-component listeners, which is how this degrades six weeks in.
- Criterion 3 is the one that ships broken most often, and it is invisible until a user tries to type the letter `s` into a note title.