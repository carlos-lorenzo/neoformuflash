# Project rules

STEM study platform: structured LaTeX/Markdown notes + spaced-repetition flashcards.
Next.js (App Router) · TypeScript strict · Supabase (Postgres + Auth + RLS) · Tiptap + KaTeX · Tailwind · Vercel.

## Before you build anything

1. Read the phase spec in `specs/` that covers this work. If none exists, stop and say so.
2. State your verification plan before writing code. If there is no way to verify it, propose a different approach.
3. Never invent a colour, spacing, radius, font size, or duration. Every one comes from a token in `specs/design-system.md`.
4. Never change files outside the phase spec's "Files I may touch" list. If you need to, stop and ask.

## Contracts are frozen

`packages/contracts/` (Zod schemas, TS types, DB migrations) is the single source of truth.
Changing it is a schema change: it needs a migration, a spec update, and my approval. Never edit it to make a test pass.

## Definition of done

A task is not done until, in this order:
- `pnpm typecheck && pnpm lint && pnpm build` pass with zero warnings
- the Playwright test for it passes and screenshots are captured at 390 / 768 / 1440
- `design-critic` has reviewed those screenshots against `refs/`
- `code-reviewer` has reviewed the diff

Do not advance to the next todo until you are 95% confident the current one is correct.

## Conventions

- Server Components by default. `'use client'` only where interactivity requires it — say why in a comment.
- Data access goes through `lib/db/*`. No Supabase client calls inside components.
- Every table has RLS. A new table without a policy is a bug.
- Errors: never swallow. Surface via typed `Result` returns, not thrown strings.
- No `any`. No `@ts-expect-error` without a linked issue.
- Tests live next to the code (`*.test.ts`); e2e lives in `e2e/`.
- **Context consumer hooks (`useContext` → `useEffect`) must depend on the stable function refs extracted from the context, not the context object itself.** If the provider rebuilds its `useMemo` context on any state change, the object identity churns and every consumer's effect re-fires — infinite loop. Extract the stable callbacks (`useCallback(…, [])`) as local variables and list only those in the deps array.

## Writing UI copy

Sentence case. Active voice. Name things by what the user controls, not how it's built.
A button that says "Publish" produces a toast that says "Published". Errors say what happened and how to fix it. Empty states invite an action.

## When something goes wrong

After any bug that reached me, append one line to `specs/EVOLUTION.md` and, if it is a recurring class of mistake, one rule here. Keep this file under ~250 lines. If it grows past that, delete and rebuild from what's actually load-bearing.


### GitNexus 
The repo is indexed. Prefer query/context over grep for code understanding. Before changing a symbol with non-trivial callers, run impact. Full reference: .claude/skills/gitnexus/gitnexus-guide/SKILL.md.