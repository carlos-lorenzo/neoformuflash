# Evolution ledger

One line per incident. Appended by the `evolve` skill. If this file is empty after a month of building, the system is not learning and something upstream is wrong.

Format: `YYYY-MM-DD · <what went wrong> · <layer fixed> · <change made>`

---

2026-08-04 · Phase 00. The app threw "Your project's URL and Key are required" and the error pointed at the Supabase dashboard, which is the wrong advice for a local stack · code · `lib/supabase/{client,middleware}.ts` now fail with the actual fix ("create .env.local from `pnpm exec supabase status`"); `playwright.config.ts` reads the keys from the CLI so the e2e suite needs no env file at all.

2026-08-04 · Phase 00. `tailwind-merge` treated `text-ui-base` (size) and `text-on-accent` (colour) as one class group and silently dropped the colour, so the primary button rendered chalk-on-blue at 2.15:1 · code + tests · `lib/cn.ts` now declares our scales via `extendTailwindMerge`, with `lib/cn.test.ts` covering it. **Only the axe run caught this** — the button still looked deliberate, so review would not have. Evidence that §9's mechanical checks carry more weight than the written rules.

2026-08-04 · Phase 00. `claim_profile_slug` returned a free slug and the caller inserted it separately, leaving a TOCTOU window; two parallel Playwright workers hit it on the first full run and one signup died on a duplicate key · schema · replaced with `create_profile()`, which retries the INSERT itself so the unique index *is* the check. `tests/db/create-profile.test.ts` fires ten simultaneous signups with the same name. Note the shape: a bug that only appears under load, only for new users, on the one action they cannot retry.

2026-08-04 · Phase 00. The app header put three stacked-label controls in 48px of chrome; at 390px "Language" was clipped and "Sign out" wrapped onto two lines · code · collapsed them into `components/settings-menu.tsx` behind one 44px trigger. Caught by reading the screenshots, not by any assertion — the layout tests passed because nothing overflowed the *page*, only the header. Worth remembering that "no horizontal scroll" is a weaker check than looking.

2026-08-04 · Phase 00. `--text-tertiary` failed 4.5:1 in both themes at its specified value · design system · lightness adjusted (dark 0.560→0.635, light 0.600→0.515), recorded in `design-system.md` §1. Added `pnpm lint:contrast`.

2026-08-04 · Phase 00. `lint:contrast` used a hand-picked pair list and missed `--text-tertiary` on `--bg-inset` (the input placeholder); axe found it only once the a11y suite was extended to `/onboarding` · tests · the checker now cross-products every foreground against every surface, which immediately surfaced two more failures nothing rendered yet (`--warning` on `--bg-inset`, `--text-tertiary` on `--bg-overlay`). **A checker whose coverage depends on remembering combinations is not a mechanism.** Same lesson: the a11y and focus suites originally covered only public pages, and extending them to the two authed screens found both of these.

2026-08-04 · Phase 00. The reduced-motion test used `test.use({ reducedMotion })`, which did not take effect — it graded un-emulated CSS and would have passed for the wrong reason just as easily as it failed · tests · switched to `page.emulateMedia()` and added an assertion that the media query actually matched. Same class of error as the first RLS check, which ran as superuser and would have reported PASS forever.
