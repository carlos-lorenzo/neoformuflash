# Design system — FROZEN

This file is law. No agent invents a colour, a spacing value, a radius, a font size, or a duration. Every visual decision in the product traces to a token below. If something you need is not here, stop and ask — do not improvise a value.

---

## 0. The direction, in one paragraph

This is a product for engineering students transcribing derivations at 11pm. The visual world it belongs to is **the lecture hall and the engineering notebook**: chalk on slate, graphite on ruled paper, Computer Modern math. Not "AI SaaS". Not a gradient in sight.

Two modes, and they are *different materials*, not a colour inversion:

- **Dark mode (default): slate.** Chalk-white marks on a deep, faintly cool slate. Ink sits *on* the surface.
- **Light mode: paper.** Warm off-white stock, graphite text. Ink sits *in* the surface.

The product's job is to disappear behind the content. Boldness is spent in exactly one place — see §8, The signature.

**What we are borrowing from the references, precisely:**

| Reference | What we take | What we do NOT take |
|---|---|---|
| Linear | Near-invisible hairline borders; information density without crowding; the 120–200ms decelerating motion feel; keyboard-first affordances | Their purple/blue brand gradient, their marketing-page 3D |
| Raycast | Command palette as the primary navigation verb; compact list rows with trailing metadata; icon restraint | Their bright multi-colour app icons |
| Vercel | Rigorous monochrome base with a single accent used sparingly; geometric sans in UI chrome | Black-and-white-only austerity; we need a reading surface |
| PlanetScale | Dense data tables that stay legible; empty states that teach | Their brand palette |

Do not copy any of their markup, CSS, or assets. We take principles and rebuild.

---

## 1. Colour

All colours are declared in OKLCH so lightness is perceptually even and we can generate hover/active states arithmetically.

### Dark (default) — "slate"

```css
--bg-base:        oklch(0.170 0.012 250);  /* page */
--bg-raised:      oklch(0.208 0.013 250);  /* cards, sidebars, editor canvas */
--bg-overlay:     oklch(0.245 0.014 250);  /* menus, dialogs, popovers */
--bg-inset:       oklch(0.145 0.012 250);  /* code blocks, inputs, wells */

--text-primary:   oklch(0.960 0.004 250);  /* chalk */
--text-secondary: oklch(0.730 0.010 250);
--text-tertiary:  oklch(0.610 0.012 250);  /* metadata, timestamps only. was 0.560 — see below */

--border-subtle:  oklch(0.290 0.013 250);  /* default 1px hairline */
--border-strong:  oklch(0.400 0.015 250);  /* hover, focus-within, active row */

--accent:         oklch(0.720 0.135 232);  /* chalk-blue. interactive + brand */
--accent-hover:   oklch(0.780 0.135 232);
--accent-quiet:   oklch(0.380 0.070 232);  /* accent-tinted surface, selection */

--success:        oklch(0.740 0.125 155);  /* "recalled easily" */
--warning:        oklch(0.800 0.125 085);  /* "due soon" */
--danger:         oklch(0.655 0.190 025);  /* red pen. destructive + "forgot" */
```

### Light — "paper"

```css
--bg-base:        oklch(0.985 0.004 090);  /* warm stock, not white */
--bg-raised:      oklch(1.000 0     000);
--bg-overlay:     oklch(1.000 0     000);
--bg-inset:       oklch(0.958 0.005 090);

--text-primary:   oklch(0.225 0.010 250);  /* graphite, not black */
--text-secondary: oklch(0.450 0.010 250);
--text-tertiary:  oklch(0.540 0.010 250);  /* was 0.600 — see below */

--border-subtle:  oklch(0.900 0.005 090);
--border-strong:  oklch(0.800 0.008 090);

--accent:         oklch(0.520 0.150 232);
--accent-hover:   oklch(0.455 0.150 232);
--accent-quiet:   oklch(0.945 0.035 232);

--success:        oklch(0.520 0.130 155);
--warning:        oklch(0.560 0.130 085);
--danger:         oklch(0.520 0.190 025);
```

### Rules

- Semantic names only in components. `bg-raised`, never `slate-800`. A component that references a raw colour is a bug.
- **Contrast is a verified requirement, not an aspiration.** Body text ≥ 4.5:1 against its background; large text and UI borders ≥ 3:1. These values are designed to hit that, but the Playwright axe run is the source of truth. If a pair fails, adjust the lightness channel only and record it here.

  **Recorded adjustments (phase 00).** Two tokens failed against real surfaces. Lightness channel only; chroma and hue unchanged. Ratios below are the worst case across all four surfaces (`--bg-base`, `--bg-raised`, `--bg-overlay`, `--bg-inset`).

  | Token | Mode | Was | Now | Worst ratio | Failing pair that caught it |
  |---|---|---|---|---|---|
  | `--text-tertiary` | dark | 0.560 | **0.635** | 4.73:1 | 3.83:1 on `--bg-raised`, 4.28:1 on `--bg-overlay` |
  | `--text-tertiary` | light | 0.600 | **0.515** | 4.97:1 | 3.78:1 on `--bg-base`, 4.47:1 on `--bg-inset` |
  | `--warning` | light | 0.560 | **0.520** | 4.90:1 | 4.15:1 on `--bg-inset` |

  `--text-tertiary` is used at `--ui-xs` (11px), which is small text, so the 3:1 large-text allowance never applies to it. `--warning` has no consumer yet; phase 03's grading row will be the first.

  `pnpm lint:contrast` checks **every** foreground against **every** surface, not a hand-picked list. The hand-picked version missed `--text-tertiary` on `--bg-inset` — the placeholder inside an input — and axe found it on `/onboarding` instead. A checker whose coverage depends on remembering the combinations is the same kind of hope this document exists to replace.
- The accent is for **interaction and identity**, never decoration. On a typical screen it appears 0–2 times.
- `--success` / `--warning` / `--danger` in the flashcard grading row are the one place three colours legitimately appear together. Everywhere else, one at most.
- No gradients. No coloured shadows. No glow.

---

## 2. Typography

The pairing is doing real work here, not aesthetics for their own sake: **KaTeX renders in Computer Modern, a serif.** A sans body face makes every inline equation look pasted in from another document. A serif body face makes prose and math read as one continuous text. This is the single most important type decision in the product.

| Role | Face | Where |
|---|---|---|
| Interface | **Geist Sans** (fallback: Inter Tight, system-ui) | Nav, buttons, labels, menus, tables, all chrome |
| Note body | **Source Serif 4** | Note reading + editing surface, flashcard fronts/backs |
| Math | **KaTeX / Computer Modern** | All rendered LaTeX. Never restyled. |
| Mono | **Geist Mono** (fallback: JetBrains Mono) | LaTeX source, code blocks, card counts, intervals, keyboard hints |

All four are open-licence and self-hosted via `next/font`. No Google Fonts CDN request at runtime.

### Scale

Two scales, because chrome wants density and reading wants air.

**Interface scale** (ratio 1.2, Geist Sans):

```css
--ui-xs:   0.6875rem / 1rem;      /* 11/16 — metadata, keyboard hints. tracking +0.01em */
--ui-sm:   0.8125rem / 1.25rem;   /* 13/20 — default UI text, table cells, menu items */
--ui-base: 0.875rem  / 1.375rem;  /* 14/22 — buttons, inputs, primary labels */
--ui-lg:   1rem      / 1.5rem;    /* 16/24 — section headers */
--ui-xl:   1.25rem   / 1.75rem;   /* 20/28 — page titles */
```

**Reading scale** (ratio 1.25, Source Serif 4):

```css
--read-sm:   0.9375rem / 1.6;   /* 15 — captions, figure labels */
--read-base: 1.0625rem / 1.7;   /* 17 — note body. tuned to sit optically level with KaTeX at 1em */
--read-h3:   1.25rem   / 1.4;
--read-h2:   1.5rem    / 1.35;
--read-h1:   1.875rem  / 1.25;
```

### Rules

- Weights: 400, 500, 600 only. Never 700 in UI chrome — weight is not how we make hierarchy; size, colour and space are.
- Reading measure is capped at **68ch**. Display equations may break out to the full canvas width.
- Sentence case everywhere. No ALL CAPS except `--ui-xs` eyebrow labels with +0.06em tracking, and those must earn their place.
- Numerals: `font-variant-numeric: tabular-nums` on every count, interval, streak, and table column. Non-negotiable — jittering digits in the review counter is the kind of thing users feel without naming.
- **KaTeX optical calibration:** set `.katex { font-size: 1.03em }` inside the reading surface. Computer Modern runs optically small against Source Serif 4 at nominal parity. Verify visually, not by spec.

---

## 3. Space

A strict **4px grid**. Every margin, padding, and gap is one of these. There are no other values.

```css
--sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
--sp-5: 24px;  --sp-6: 32px;  --sp-7: 48px;  --sp-8: 64px;  --sp-9: 96px;
```

Defaults so agents stop guessing:

- Inside a button: `--sp-2` vertical, `--sp-3` horizontal
- Between fields in a form: `--sp-4`
- Between a label and its control: `--sp-1`
- Between cards in a list: `--sp-2` (dense) or `--sp-3` (comfortable)
- Between page sections: `--sp-6`
- Page gutter: `--sp-4` mobile, `--sp-6` desktop
- Icon to adjacent text: `--sp-2`

Vertical rhythm in the note surface: paragraph spacing `--sp-4`, before a heading `--sp-6`, after a heading `--sp-3`, around a display equation `--sp-5`.

---

## 4. Shape, border, elevation

```css
--radius-sm: 4px;   /* inputs, badges, table cells */
--radius-md: 6px;   /* buttons, cards, menu items — the default */
--radius-lg: 10px;  /* dialogs, the review card */
--radius-full: 9999px; /* avatars, streak pip only */
```

- Every raised surface is defined by a **1px `--border-subtle` hairline**, not a shadow. This is the Linear lesson: separation by edge, not by blur.
- **Shadows exist only on things that float above the page and can be dismissed** — popovers, dropdowns, dialogs, toasts. Exactly two:
  ```css
  --shadow-overlay: 0 4px 16px -2px oklch(0 0 0 / 0.35);
  --shadow-dialog:  0 16px 48px -8px oklch(0 0 0 / 0.45);
  ```
- Nothing else in the product casts a shadow. Not cards, not buttons, not the sidebar.
- Focus ring, on every interactive element, no exceptions:
  ```css
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  ```

---

## 5. Motion

```css
--dur-instant: 80ms;   /* colour/opacity on hover */
--dur-fast:    140ms;  /* menus, tooltips, toggles */
--dur-base:    200ms;  /* dialogs, panels, card flip */
--ease-out:    cubic-bezier(0.32, 0.72, 0, 1);  /* the default. decelerating. */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);  /* only for reversible flips */
```

- Default to `--ease-out`. Things arrive quickly and settle. Nothing bounces. Nothing springs.
- Animate `transform` and `opacity` only. Never `height`, `width`, `top`, or `left`.
- **Nothing on the page moves unless the user caused it.** No ambient animation, no auto-carousels, no shimmer on idle.
- Skeletons: a static `--bg-inset` block. No shimmer sweep.
- `@media (prefers-reduced-motion: reduce)` sets every duration to `1ms` and disables the card flip transform (swap instantly instead). This is enforced in a Playwright test, not left to good intentions.

---

## 6. Layout and breakpoints

```
390px   mobile   — reader + review only. Editor shows "open on a larger screen".
768px   tablet   — reader, review, browse. Editor usable but not primary.
1024px  laptop   — full editor, single sidebar
1440px  desktop  — full editor, sidebar + optional outline rail
```

Structure: a fixed left sidebar (240px, collapsible to 56px icon rail), a content column capped at 68ch for reading and full-bleed for the editor canvas, and an optional right outline rail (200px) at ≥1440px only.

Mobile review screen is thumb-first: the grading row sits in the bottom 25% of the viewport, targets ≥ 44×44 with ≥ `--sp-2` between them.

---

## 7. Component rules that keep coming up

**Buttons.** Exactly one primary per screen region. Primary = `--accent` fill. Secondary = transparent + `--border-subtle`. Ghost = transparent, no border, for toolbar density. Destructive = `--danger` text on transparent, filled only inside a confirm dialog.

**Empty states.** Never a blank region with grey text. Every empty state has: the ruled-grid signature (§8), one line naming what goes here in the user's words, and exactly one action. "No notes yet" is not acceptable copy; "Your first note starts here" plus a *Create note* button is.

**Lists and tables.** Row height 36px dense / 44px comfortable. Row separation by `--border-subtle` hairline, not by alternating fills. Trailing metadata in `--ui-xs` / `--text-tertiary`, right-aligned, tabular numerals.

**The review card.** `--radius-lg`, `--bg-raised`, centred, capped at 640px. The flip is a 200ms Y-axis rotation using `--ease-in-out`. Nothing else is on screen during a review session — no nav, no sidebar, no ads, ever. Grading row: four options using `--danger` / `--warning` / `--text-secondary` / `--success`, each with its interval preview in mono beneath.

**Math in flashcards.** Fronts and backs render KaTeX at the reading scale. A card whose content overflows scales the font down one step rather than scrolling. Never scroll a flashcard.

**Ads.** `--bg-inset` container, 1px `--border-subtle`, a `--ui-xs` `--text-tertiary` "Sponsored" label above it, and `--sp-6` of clearance from real content. Ads are never inside the review route, and never inside the editor canvas.

---

## 8. The signature

One memorable element, used sparingly, that says *engineering notebook*:

**The ruled grid.** A 24px square grid drawn in `--border-subtle` at 40% opacity, appearing in exactly three places:
1. Behind empty states
2. In the editor canvas margin (a single vertical hairline rule at the 68ch measure edge, like a notebook's margin line)
3. Behind the auth and onboarding screens — the full-screen, pre-app moment, `/login` and
   `/onboarding` alike. Written as "the auth screen" until the phase 00 review, where a critic
   read that strictly and flagged `/onboarding` as a fourth surface. It is one moment in the
   product, so it is one entry here.

It never appears behind live content, never animates, and never uses the accent colour. That restraint is what stops it becoming a texture and keeps it a signature.

---

## 9. How agents verify compliance

Every UI phase must pass, mechanically:

1. **Token lint** — `pnpm lint:tokens` fails the build on any hex literal, `rgb()`, `px` value not on the 4px grid, or `ms`/`s` duration in a component file. This is the enforcement mechanism; the rest of this document is intent.
2. **Contrast** — axe-core via Playwright, zero violations, both modes.
3. **Reduced motion** — a test that sets `prefers-reduced-motion: reduce` and asserts no transition exceeds 1ms.
4. **Screenshots** at 390/768/1440 for every state, reviewed by the `design-critic` subagent against `refs/`.
5. **Focus** — a test that tabs through every interactive element on the page and asserts a visible outline on each.

Written rules are hopes. Items 1–5 are the actual guarantee.
