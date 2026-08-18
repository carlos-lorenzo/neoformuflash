# Phase 03c — Course-First UX Redesign

**Status:** planned
**Depends on:** phase-03b-remediation (courses, decks, notes, review engine)
**Blocks:** phase-04 (public), phase-05 (AI layer), phase-06 (monetization)

## Goal and why

The current structure allows creating decks and notes without a course, making the course hierarchy optional and the sidebar navigation misleading (Home, Courses, Decks, Notes all at the same level). Users must create a course first, then work inside it. The new workflow:

1. **Dashboard** → course cards with due counts, streak, quick "Open" action
2. **Course detail** → Decks section + Notes section, settings hidden in menu
3. **Create** → "New deck" / "New note" buttons live inside the course detail
4. **Review** → `/app/courses/[courseId]/review/[deckId]` (canonical)
5. **No standalone** `/app/decks` or `/app/notes` listings — everything is course-scoped

The database is pre-deployment; orphan decks/notes (`course_id = null`) will be deleted.

---

## Not in this phase

- Sharing UI (subscribe/fork buttons, browsing) — phase 04 3
- AI generation from notes — phase 05
- Public profiles / SEO — phase 05
- Drag reordering, card search, import/export — all later

---

## Contract changes

None. All columns, enums, triggers, RLS, and column grants already exist (phases 01, 03, 03b). `decks.course_id` and `notes.course_id` stay nullable at the DB level — the requirement is a UX affordance, not a schema invariant.

---

## Routes — removals

| Old route | Method | Replacement |
|---|---|---|
| `/app/decks` | GET | **Removed** — use course detail decks section |
| `/app/decks/new` | GET | **Removed** — use "New deck" in course detail |
| `/app/decks/[id]` | GET | Keep — deck detail (owner/subscriber access) |
| `/app/decks/[id]/cards/new` | GET | Keep — card editor (deck owner) |
| `/app/decks/[id]/cards/[cardId]/edit` | GET | Keep — card editor (deck owner) |
| `/app/notes` | GET | **Removed** — use course detail notes section |
| `/app/notes/new` | GET | **Removed** — use "New note" in course detail |
| `/app/notes/[id]` | GET | Keep — note editor (owner) |
| `/review/[deckId]` | GET | **Removed** — canonical at `/app/courses/[courseId]/review/[deckId]` |

---

## Routes — additions

| Path | Method | Component | Access |
|---|---|---|---|
| `/app/courses/[courseId]/review/[deckId]` | GET | `ReviewSession` | owner or visible |

---

## Server actions — changes

| Action | Change |
|---|---|
| `createDeck` | `courseId` becomes **required** (Zod: `.uuid()`) |
| `createNote` | `courseId` becomes **required** (Zod: `.uuid()`) |
| `createCourse` | Unchanged |
| `saveDeck` | Unchanged |
| `saveNote` | Unchanged |

---

## Component inventory — new / modified

| Component | Type | States |
|---|---|---|
| `DashboardPage` | Server | empty (create course), grid of CourseCards with due counts |
| `CourseDetail` | Server | decks list + notes list, settings in `<details>`, CreateDeckInCourse, CreateNoteButton |
| `CourseCard` | Server | name, code, due badge, "Open" link |
| `CreateDeckInCourse` | Client | hidden title, courseId prefilled, submit → redirect to deck detail |
| `CreateNoteInCourse` | (new) | hidden title, courseId prefilled, submit → redirect to note editor |
| `DeckDetail` | Server | settings in `<details>`, card list, Study button → `/app/courses/[cid]/review/[did]` |
| `ReviewPage` | Server | moved under course route, same `ReviewSession` |
| `AppShell` | Server | nav: Home (Dashboard), Courses only. Review removed from sidebar. |

---

## Navigation structure

### Sidebar (desktop ≥ tablet)

```
FormuFlash
├── Home (Dashboard)          → /app
├── Courses                   → /app/courses
└── (no Decks, no Notes, no Review)
```

### Mobile bottom nav (hidden ≥ tablet)

```
[Home] [Courses]
```

### Course detail internal nav

Course header shows course name + code. Below: two sections stacked:

1. **Decks** — list with "Study" button per deck, "New deck" button
2. **Notes** — list with "Open" link per note, "New note" button
3. **Settings** — `<details>` (collapsed by default) with CourseForm

---

## Acceptance criteria

1. **Dashboard empty state** shows "Create your first course" with CreateCourseButton.
2. **Dashboard with courses** shows grid of CourseCards. Each card displays name, code (if any), due badge (count of due cards across all decks in that course), "Open course" link.
3. **Course detail** shows Decks section (list with Study buttons, New deck button) and Notes section (list with Open links, New note button). Settings hidden in collapsed `<details>`.
4. **Creating a deck** from course detail: clicks "New deck" → creates draft deck with `courseId` prefilled → redirects to `/app/decks/[id]` (deck detail).
5. **Creating a note** from course detail: clicks "New note" → creates draft note with `courseId` prefilled → redirects to `/app/notes/[id]` (note editor).
6. **Deck detail** shows card list, Study button goes to `/app/courses/[courseId]/review/[deckId]`. Settings in collapsed `<details>`.
7. **Review session** at `/app/courses/[courseId]/review/[deckId]` works identically to old `/review/[deckId]`.
8. **No route** `/app/decks`, `/app/decks/new`, `/app/notes`, `/app/notes/new`, `/review/[deckId]` returns 404.
9. **Sidebar** shows only Home and Courses. Mobile bottom nav shows only Home and Courses.
10. **Orphan data**: migration script deletes all decks/notes with `course_id IS NULL` (pre-deployment only).

---

## Migration script (one-time, pre-deployment)

```sql
-- Run once before deploying this phase. App has no production data.
DELETE FROM public.cards WHERE deck_id IN (SELECT id FROM public.decks WHERE course_id IS NULL);
DELETE FROM public.decks WHERE course_id IS NULL;
DELETE FROM public.notes WHERE course_id IS NULL;
```

---

## Verification

- `pnpm typecheck && pnpm lint && pnpm lint:tokens && pnpm build && pnpm test`
- Playwright flows (new):
  - `ux-dashboard-empty` — empty dashboard shows create course
  - `ux-dashboard-with-courses` — grid with due badges
  - `ux-course-detail` — decks + notes sections, settings collapsed
  - `ux-create-deck-in-course` — creates deck, redirects to deck detail
  - `ux-create-note-in-course` — creates note, redirects to editor
  - `ux-review-under-course` — review session loads at new URL
  - `ux-removed-routes-404` — old routes return 404
- Screenshots: empty dashboard, populated dashboard, course detail, deck detail, review session → `design-critic`
- Reviewers: test-runner, design-critic, code-reviewer

---

## Files I may touch

```
app/app/page.tsx                           (dashboard)
app/app/courses/page.tsx                   (courses list - unchanged)
app/app/courses/new/page.tsx               (create course - unchanged)
app/app/courses/[id]/page.tsx              (course detail - MODIFY)
app/app/courses/[id]/review/[deckId]/page.tsx  (NEW - review under course)
app/app/decks/page.tsx                     (DELETE)
app/app/decks/new/page.tsx                 (DELETE)
app/app/decks/[id]/page.tsx                (deck detail - MODIFY: study URL)
app/app/decks/[id]/cards/new/page.tsx      (unchanged)
app/app/decks/[id]/cards/[cardId]/edit/page.tsx (unchanged)
app/app/notes/page.tsx                     (DELETE)
app/app/notes/new/page.tsx                 (DELETE)
app/app/notes/[id]/page.tsx                (unchanged)
app/(review)/review/[deckId]/page.tsx      (DELETE)
app/(review)/review/[deckId]/actions.ts    (DELETE)
app/(review)/layout.tsx                    (DELETE if no other routes)
app/app/decks/actions.ts                   (MODIFY: createDeck requires courseId)
app/app/notes/actions.ts                   (MODIFY: createNote requires courseId)
components/layout/app-shell.tsx            (MODIFY: nav items)
components/courses/course-detail.tsx       (MODIFY: settings in details, add CreateNoteInCourse)
components/courses/create-deck-in-course.tsx (MODIFY: redirect to deck detail)
components/courses/create-note-in-course.tsx (NEW)
components/decks/deck-detail.tsx           (MODIFY: study URL, settings in details)
components/decks/deck-list.tsx             (DELETE or repurpose)
components/decks/create-deck-button.tsx    (DELETE - replaced by CreateDeckInCourse)
components/decks/course-filter.tsx         (DELETE)
components/editor/note-form.tsx            (DELETE - replaced by CreateNoteInCourse)
components/editor/create-note-button.tsx   (MODIFY: accept courseId prop for course detail)
lib/db/decks.ts                            (MODIFY: listCourseDecks stays, listDecks removed from nav)
lib/db/notes.ts                            (MODIFY: listCourseNotes stays, getNotes removed from nav)
scripts/migrate-delete-orphans.sql         (NEW - one-time migration)
e2e/ux/                                    (NEW - Playwright flows)
```

---

## Risks and open questions

1. **Subscribed users**: A user subscribed to a course sees it in their course list (phase 03b RLS). The dashboard `listCourses` currently filters to `owner_id = userId`. Should subscribers see subscribed courses on the dashboard?
   - Decision: Keep dashboard owner-only for now. Subscribed courses accessible via a future "Browse" / "Library" view (phase 05).

2. **Deck detail access**: Deck detail at `/app/decks/[id]` remains for owner + subscribers. The Study button must compute the courseId to build the review URL. `DeckRow` already has `courseId`.

3. **Direct deck links**: If someone bookmarks `/app/decks/xyz`, it still works. The review button redirects to the course-scoped review URL. No breaking change for existing deck URLs.

4. **Review session ownership check**: The new review route must verify the deck belongs to the course in the URL (prevents URL manipulation). `getDeck` + check `deck.courseId === courseId`.

5. **Keyboard shortcuts**: `shortcuts.list.create` (c) currently goes to `/app/decks/new`. Now it should be contextual: on dashboard → create course; on course detail → create deck (or note?).
   - Decision: Scope shortcuts to the page. Dashboard: `c` = create course. Course detail: `d` = create deck, `n` = create note. Update `shortcuts.md` and registrations.

6. **Empty course deletion**: Delete button in settings `<details>` — confirmed in messages.

7. **Streak display**: Dashboard currently doesn't show streak. Course detail doesn't either. Keep streak on deck list (inside course) and review completion screen. Add to dashboard if requested later.

---

## Implementation order (suggested)

1. **Migration script** — run locally, verify clean state
2. **Routes** — delete old, add new review route, update deck/note actions
3. **Components** — CourseDetail, CreateNoteInCourse, DeckDetail study URL
4. **Navigation** — AppShell nav items, remove CourseFilter
4. **Dashboard** — verify CourseCard due counts work
5. **Shortcuts** — update registrations and labels
6. **E2E tests** — write new flows, delete old deck/notes list tests
7. **Verify** — typecheck, lint, build, test, screenshots