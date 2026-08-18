# Keyboard shortcuts — FROZEN registry

This file exists for the same reason `packages/contracts/` exists.

Phases 02, 03 and 04 are built in parallel worktrees. Each one will want `n` for "new". Whichever merges last discovers the collision, and the fix is a UI change plus a documentation change plus a muscle-memory change for anyone already using it. **A binding not listed here does not exist.** A phase that needs one stops and asks, exactly as it would for a schema change.

---

## The two-tier model

Taken from Linear, which is the reference that got this right: **`g` + letter navigates, bare letters act on what you are looking at.** Navigation is global and rare; actions are contextual and frequent, so actions get the shorter keys.

## Global — available on any authenticated screen

| Keys | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `?` | Shortcut overlay |
| `/` | Focus search |
| `Esc` | Close topmost layer — menu, then dialog, then selection |
| `g` `h` | Home / dashboard |
| `g` `n` | Notes |
| `g` `c` | Courses |
| `g` `d` | Decks |
| `g` `p` | My profile |
| `g` `s` | Settings |

`g` opens a 1.5s window for its second key, shown as a subtle indicator. A second key not in the map cancels silently.

## List and browse screens

| Keys | Action |
|---|---|
| `c` | Create — context-aware (new note on notes, new deck on decks) |
| `j` / `↓` | Next item |
| `k` / `↑` | Previous item |
| `Enter` | Open focused item |
| `e` | Edit focused item |
| `s` | Study — start review of focused deck |
| `p` | Toggle publish / visibility on focused item |
| `f` | Fork focused course |
| `⌘⌫` | Delete focused item (always confirms) |

## Editor

**Every bare-letter shortcut is disabled here.** The editor is the product's main surface and a bare `n` must type the letter n. Editor bindings are modifier combinations only.

| Keys | Action |
|---|---|
| `⌘S` | Force save (autosave still runs; this is for reassurance) |
| `⌘B` / `⌘I` | Bold / italic |
| `⌘M` | Inline math |
| `⌘⇧M` | Display math |
| `⌘⇧K` | Link |
| `⌘↩` | Save and close — explicitly-saved editors only (card editor) |
| `⌘⇧↩` | Save and create another — card editor only |
| `Esc` | Exit math node into surrounding text; otherwise cancel and close |
| `/` | Slash menu — only at the start of an empty block |

**On `⌘↩` / `⌘⇧↩` (added phase 03b).** The note editor autosaves, so it needs no save key
beyond `⌘S`'s reassurance. The card editor does not: a card is a small, discrete unit that is
either committed or abandoned, and the dominant act is writing several in a row. `⌘⇧↩` exists
because "save and immediately start the next one" is the whole workload when building a deck —
without it every card costs a round trip through the deck page.

`↩` is safe to bind with a modifier here: bare `Enter` inside a Tiptap block creates a
paragraph and must keep doing so.

**On `Esc` (clarified phase 03b).** The global row below reads "close topmost layer", and this
row is a case of it — but the dispatcher was blocking `Esc` inside every editable target,
including this one, so a card editor could be opened and never dismissed by keyboard. *Never
bind* forbids **bare letters** in an editable; `Esc` is not a letter, and closing is exactly
what a user expects it to do. Bindings that need it opt in explicitly (`allowInEditable`), so
the default stays closed and nothing else changes.

## Review session

Nothing here may open a dialog, navigate away, or interrupt. The review screen is a focused surface.

| Keys | Action |
|---|---|
| `Space` | Reveal answer, then grade Good |
| `1` `2` `3` `4` | Again / Hard / Good / Easy |
| `e` | Edit this card inline |
| `u` | Undo last grade |
| `Esc` | End session (confirms if cards remain) |

## Never bind

- Anything the browser owns: `⌘T`, `⌘W`, `⌘L`, `⌘R`, `⌘N`, `⌘⇧N`, `⌘Q`, `F5`, `⌘[`, `⌘]`.
- Any bare letter while focus is inside an `input`, `textarea`, `select`, or `contenteditable`. The dispatcher checks this before anything else — it is the single most common way keyboard shortcuts ship broken. **This means bare letters. `Esc` is exempt by opt-in** — see the Editor section.
- `⌘⇧P` — reserved for browser and OS command surfaces on several platforms.

---

## Implementation rules

**Match on `event.key`, not `event.code`.** Users are on Spanish and Catalan keyboards. `event.key` gives the character the layout actually produces, so `?` works whether it needs Shift+' or Shift+/. `event.code` would bind the physical key position and produce different letters on different layouts.

**No AltGr-dependent characters.** On an ES layout `#` is AltGr+3 and `@` is AltGr+2. Neither is a usable shortcut. This is why delete is `⌘⌫` rather than the `#` that several reference apps use.

**One dispatcher, scoped by context.** A single provider owns the listener and resolves against the active scope (`global` → `list` → `editor` → `review`). Per-component `keydown` handlers are how conflicts get reintroduced after this file has been followed correctly.

**Respect `profiles.keyboard_shortcuts_enabled`.** Bare-letter shortcuts collide with screen-reader quick-navigation keys, where a lone `e` means "next edit field". Users who need them off must be able to turn them off; modifier combinations stay active either way.

**Nothing is shortcut-only.** Every action reachable by keyboard is reachable by pointer. Shortcuts are an accelerator, never the only path.

## Localisation

**Keys are fixed across all locales.** They do not follow translated mnemonics — `n` stays `n` whether the label says "New" or "Nueva". Rebinding per language would make every screenshot, every tutorial and every piece of muscle memory locale-specific for no gain.

The *hint labels* are translated; the *keys* are not. Display uses platform-correct symbols: `⌘` on macOS, `Ctrl` elsewhere, detected once and rendered from a `Kbd` component rather than hardcoded per call site.

## Where hints appear

Per `refs/01-navigation/menu_with_shortcuts.png` and `refs/04-empty-states/empty_projects_with_hint.png`:

- **Menu and command-palette rows** — right-aligned trailing `Kbd`, `--text-tertiary`, never wider than the label it sits beside.
- **Empty states** — one hint under the primary action, phrased as an invitation rather than documentation. "Press `c` to create your first note", not "Shortcut: c".
- **Tooltips** — action name, then the key, on any icon-only button.
- **Never** show a hint for a shortcut that does not work in the current context. A greyed-out `Kbd` is worse than no `Kbd` — it teaches the wrong binding.

Discoverability comes from these three surfaces plus the `?` overlay. If a shortcut appears in none of them, nobody will find it and it should not exist.