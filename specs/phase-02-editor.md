# Phase 02 — Structured note editor

## Goal and why
A student can transcribe a lecture into a structured note with real math, faster than they could by hand, without knowing LaTeX syntax up front. This is the product's core claim and its hardest engineering. Everything else — flashcards, AI, sharing — is downstream of notes existing and being pleasant to write.

The design tension to hold: **power users need raw LaTeX/Markdown expressiveness; beginners need to never be blocked by it.** Resolve this with progressive disclosure (typing `$` opens a math input with live preview and a symbol palette), not by hiding one from the other.

## Not in this phase
AI assistance of any kind. Flashcard generation. Sharing, publishing, or public rendering. Collaboration. Images or file uploads. Version history.

## Contract changes
None. `notes`, `content_json`, `content_text` and the Tiptap node union are frozen in phase 01. If you need a schema change, stop.

## Routes and server actions
| Path | Method | Input | Output | Auth |
|---|---|---|---|---|
| `/app/notes` | GET | — | note list | owner |
| `/app/notes/new` | POST | `CreateNoteInput` | note id | owner |
| `/app/notes/[id]` | GET | — | editor | owner |
| `saveNote` (action) | POST | `UpdateNoteInput` | `{ savedAt }` | owner |

## Component inventory
| Component | Client/Server | States |
|---|---|---|
| `NoteEditor` | client | empty, typing, saving, saved, save-failed, offline |
| `SlashMenu` | client | open, filtered, no matches, keyboard nav |
| `MathInput` | client | editing, valid preview, invalid LaTeX, empty |
| `SymbolPalette` | client | categories, search, recently used |
| `SelectionToolbar` | client | text selected, math selected, hidden |
| `NoteOutline` | client | headings present, none, deep nesting |
| `SaveIndicator` | client | idle, saving, saved, error with retry |
| `NoteList` | server | empty, 1 note, 200 notes, long titles |

## Acceptance criteria
1. Typing `#`, `##`, `-`, `1.`, `>`, ``` produces the corresponding block, as in Markdown.
2. Typing `/` opens the slash menu; arrow keys and Enter select; Escape closes and leaves the `/` as literal text.
3. Typing `$` inline opens math input; the LaTeX renders live via KaTeX as the student types; Escape cancels cleanly.
4. `$$` on an empty line creates a display equation, centred, breaking the reading measure.
5. Invalid LaTeX shows the error inline in `--danger` and never crashes the editor or loses the surrounding paragraph.
6. The note autosaves 800ms after typing stops; the indicator moves idle → saving → saved; a failed save retries and only then shows an error with a manual retry.
7. Closing and reopening a note restores it exactly, including math nodes and cursor-independent structure.
8. `content_text` is regenerated on every save and contains readable text with math rendered as its LaTeX source.
9. A note with 5,000 words and 40 equations stays responsive: typing latency stays under 50ms.
10. At 768px the editor is usable; at 390px it shows a read-only view with a clear message.
11. Every symbol in the palette inserts correct LaTeX and is reachable by keyboard.

## Verification
- `pnpm typecheck && pnpm lint && pnpm lint:tokens && pnpm build && pnpm test`
- Playwright flows: `editor-markdown-shortcuts`, `editor-slash-menu`, `editor-inline-math`, `editor-display-math`, `editor-invalid-latex`, `editor-autosave-and-reload`, `editor-large-document-perf`, `editor-mobile-readonly`
- Unit tests: `extractText` against a fixture document containing every node type
- Screenshots: empty note, note with prose + inline math, note with three display equations, save-failed state, 390px view → `design-critic`
- Reviewers: test-runner, design-critic, code-reviewer

## Files I may touch
`app/app/notes/**`, `components/editor/**`, `lib/editor/**`, `lib/db/notes.ts`, `e2e/editor/**`. **Not** `packages/contracts/**`, **not** `components/ui/**`.

## Risks and open questions
- **Highest risk in the project.** Tiptap's math handling is the part most likely to eat a week. Before building the full editor, spike it: one day, a bare Tiptap instance with an inline math node that round-trips through JSON. If that spike is not clean, stop and reconsider before building anything on top.
- Undo across a math node boundary is a classic ProseMirror trap. Write the test first.
- Conceptual continuity with Carlos's existing flashcard editor: read it for interaction decisions that already work. Do not port the code.
