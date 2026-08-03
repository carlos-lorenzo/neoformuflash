# Reference corpus — what to collect and why

Agents read images well. This folder is how design taste gets transferred without you having to describe it. `design-critic` looks here every time it reviews a screen.

**Do not save HTML, CSS, or source from these sites.** It is minified, framework-specific, legally theirs, and produces worse output than principle extraction. Screenshots plus the written notes below are strictly better inputs.

## How to organise

By **flow**, not by company. The critic asks "what does a good empty state look like", not "what does Linear look like".

```
refs/
├── ANNOTATIONS.md          ← this file
├── 01-navigation/          sidebars, command palettes, breadcrumbs
├── 02-lists-tables/        dense rows, sorting, trailing metadata
├── 03-editor/              writing surfaces, toolbars, slash menus
├── 04-empty-states/        first-run, no-results, error
├── 05-forms-settings/      inputs, toggles, validation, destructive confirms
├── 06-auth/                sign-in screens
├── 07-mobile/              phone-width reading and card-review patterns
└── 08-marketing/           landing page composition (public note pages, SEO surfaces)
```

Filename convention: `source-surface-width.png` → `linear-sidebar-1440.png`, `raycast-palette-1440.png`.

## Target: 24–32 images. More is worse.

| Folder | Count | What specifically to capture |
|---|---|---|
| 01-navigation | 4 | Linear's collapsed + expanded sidebar. Raycast's command palette mid-search. One breadcrumb + page-header combination. |
| 02-lists-tables | 5 | Linear's issue list at high density. PlanetScale's branch/deploy table. Any table with a numeric column, so you can see tabular-numeral alignment. |
| 03-editor | 5 | **The highest-value folder.** Notion's slash menu open. Any editor showing a selection toolbar. Anything rendering math inline with prose — Overleaf's preview pane, a good textbook PDF page. Capture how heading spacing works in a long document. |
| 04-empty-states | 4 | Linear and PlanetScale both do these well. Get at least one no-results state, distinct from a first-run state. |
| 05-forms-settings | 4 | A settings page with grouped sections. An inline validation error. A destructive confirm dialog. |
| 06-auth | 2 | Vercel and Linear sign-in. Note how little is on them. |
| 07-mobile | 5 | Mobbin, filtered to mobile. Anki or Brainscape's review screen for the grading row layout. A long-form reading view at phone width. |
| 08-marketing | 3 | Godly, filtered to dark + SaaS. Only take composition and type hierarchy from these; ignore their animation. |

## Sources

- **Mobbin** — full flows, real apps, filterable by pattern. Best source for 01, 04, 07.
- **Refs.Gallery** — "Dark UI" and "SaaS" tags, as you noted. Best for 08 and general dark-mode calibration.
- **Godly.website** — landing composition only.
- **The products themselves** — Linear, Raycast, Vercel and PlanetScale all have free tiers. Screenshots of the real running app beat marketing screenshots every time, because marketing screenshots are staged with unrealistically tidy data.

Capture at 1440px unless the folder says mobile. Include the surrounding chrome — the critic needs to see the spacing *between* things, which a cropped component screenshot destroys.

## Write this next to each folder

Create a one-paragraph `NOTES.md` inside each folder answering: **what is the one thing this folder proves, that I want copied?** For example, in `02-lists-tables`:

> These rows are 36px tall with a single hairline separator and no zebra striping, and they still read cleanly at 40 rows. The trailing metadata is a full step smaller and two steps dimmer than the row title. Density comes from tight line-height and dim secondary text, not from shrinking everything uniformly.

That paragraph is what the critic actually reasons over. The images give it something to point at.

## Anti-patterns file

Also make `refs/00-avoid/` with 4–6 screenshots of what you *don't* want — the generic AI-SaaS look. Purple-to-blue gradient heroes, glassmorphism cards, floating 3D shapes, four-colour icon grids. Negative examples are unusually effective at steering a model away from its defaults, and this is exactly the failure mode you are most at risk of.
