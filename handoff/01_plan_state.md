# Phase 01 handoff — ready to ship

## Gate (2026-08-06)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass (`.gitnexus/**` added to eslint ignores — generated index) |
| `pnpm build` | pass (`assert-build-safe` clean) |
| `pnpm test` (unit) | 79/79 |
| `pnpm db:reset && pnpm test:rls` | 101/101 |
| Spec embedded SQL | synced to `0005_sharing.sql` + `0007_rls_and_grants.sql` |

No Playwright / design-critic — phase renders nothing.

## Security fixes landed this session (auditor Findings 1–4, 6)

1. **Course containment on SELECT** — `notes`/`decks`/`cards` public policies re-check parent course is not private/soft-deleted.
2. **Publish gate** — `notes_select_public` requires `published_at is not null` when `visibility = 'public'` (unlisted unchanged).
3. **Ownership on INSERT/UPDATE** — notes/decks WITH CHECK: course/note must be owned by caller.
4. **BYOK columns** — `user_api_keys` SELECT is column-scoped: `(user_id, provider, last_four, created_at)` only; never `ciphertext`/`iv`.
5. **Finding 5 accepted** — unlisted enumerable via bare select is intentional app-layer convention (documented in `tests/rls/content.test.ts` header).
6. **security definer containment** — `apply_review` / `acknowledge_card_change` join through decks (+ course) and reject unreadable cards.

Also earlier: `fork_course`/`fork_deck` copy `content_version`; card loop scoped to `fork_deck_map`.

## Deliverables complete

Tasks #1–#10. Migrations 0003–0007, contracts package, fixtures, unit + RLS/DB tests, seed script, ADR-002, phase-01 spec, ROADMAP link.

## Out of phase file touch

- `eslint.config.mjs` — ignore for `.gitnexus/**` so lint gate passes against the generated GitNexus index (not phase product code).

## Next session

Phase 01 is gate-green. Commit when ready. Phase 00b can land in parallel; 02/03/04 wait on 01.
