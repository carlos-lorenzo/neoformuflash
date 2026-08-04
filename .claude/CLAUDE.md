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

## Writing UI copy

Sentence case. Active voice. Name things by what the user controls, not how it's built.
A button that says "Publish" produces a toast that says "Published". Errors say what happened and how to fix it. Empty states invite an action.

## When something goes wrong

After any bug that reached me, append one line to `specs/EVOLUTION.md` and, if it is a recurring class of mistake, one rule here. Keep this file under ~250 lines. If it grows past that, delete and rebuild from what's actually load-bearing.


<!-- gitnexus:start -->
# GitNexus — Code Intelligence

Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/neoformuflash/context` | Codebase overview, check index freshness |
| `gitnexus://repo/neoformuflash/clusters` | All functional areas |
| `gitnexus://repo/neoformuflash/processes` | All execution flows |
| `gitnexus://repo/neoformuflash/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->