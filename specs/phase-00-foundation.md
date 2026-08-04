# Phase 00 — Foundation

## Goal and why
Get a deployable Next.js app where a student can sign in with Google and land on an empty dashboard that already looks like the product. Everything after this depends on the design tokens, the auth session, and the verification harness existing and being trustworthy. Build the harness before the product, or every later phase inherits an unverifiable base.

## Not in this phase
Notes, decks, cards, editor, AI, ads, payments, profile pages, any real data. The dashboard is an empty state and nothing more.

Localisation **plumbing** is in scope; translation coverage beyond `es` and `en` is not. Get the mechanism right now — retrofitting i18n across a finished app means touching every component, which is the expensive version of this task. Catalan (`ca`) is a catalog file added later, not a code change.

## Contract changes
`profiles`, `institutions`, `degrees` tables only, plus their RLS. The rest of the schema lands in phase 01.

`0002_rls_column_grants.sql` adds no tables and no columns. It narrows write privileges to the
column level after the security audit found four privilege escalations that row-level policies
cannot reach — a user could self-grant `is_pro`, insert a profile directly with a chosen slug,
forge a moderation request's `status`, or call `claim_profile_slug` anonymously. Approved by
the owner on 2026-08-04. It also adds a reserved-slug denylist, because the slug immutability
trigger makes a squat permanent and phase 04 serves public profiles at `/{slug}`.

## Routes and server actions
| Path | Method | Input | Output | Auth |
|---|---|---|---|---|
| `/` | GET | — | marketing/landing, static | public |
| `/login` | GET | — | Google sign-in | public |
| `/auth/callback` | GET | OAuth code | redirect | public |
| `/onboarding` | GET/POST | `SignupProfileInput` | profile row | authed, first-run only |
| `/app` | GET | — | dashboard empty state | authed |

## Component inventory
| Component | File | Client/Server | States |
|---|---|---|---|
| `Button` | `components/ui/button.tsx` | client | default, hover, active, disabled, loading, focus-visible |
| `Input` | `components/ui/input.tsx` | client | default, focus, error, disabled |
| `Select` | `components/ui/select.tsx` | client | closed, open, empty options, long list |
| `Dialog` | `components/ui/dialog.tsx` | client | open, closed, reduced-motion |
| `EmptyState` | `components/ui/empty-state.tsx` | server | with/without action, with ruled-grid signature |
| `AppShell` | `components/layout/app-shell.tsx` | server | sidebar expanded, collapsed, 390px |
| `ThemeToggle` | `components/theme-toggle.tsx` | client | dark, light, system |
| `LocaleSwitcher` | `components/locale-switcher.tsx` | client | current locale, switching, persisted to profile |

These seven are the shared primitives. Phases 02–04 use them and do not invent alternatives.

## Acceptance criteria
1. A new user signs in with Google, is asked for display name, institution and degree, and lands on `/app`.
1b. Signup derives an immutable `slug` and an editable `handle` from the Google account, resolving collisions with a numeric suffix. Accented and non-Latin display names still produce a valid slug.
1c. Interface language is detected from `Accept-Language` on first visit, stored on the profile, and changeable from settings. No flash of the wrong language on load.
2. A returning user goes straight to `/app` without seeing onboarding.
3. Signing out clears the session; visiting `/app` afterwards redirects to `/login`.
4. Every colour, spacing and type value on screen comes from a token — `pnpm lint:tokens` passes.
5. Dark and light modes both render correctly; the choice persists across reloads without a flash of the wrong theme.
6. At 390px the shell has no horizontal scroll and every target is ≥44px.
7. Tabbing through `/login` and `/onboarding` shows a visible focus ring on every control.
8. The dashboard empty state names what goes there and offers exactly one action.
9. `pnpm lint:i18n` passes — no user-visible string literal anywhere in `app/` or `components/`.
10. The pseudo-locale pass (every string padded 40%) shows no overflow or truncation at 390px.

## Verification
- `pnpm typecheck && pnpm lint && pnpm lint:tokens && pnpm build`
- `pnpm test:e2e` — flows: `auth-signup`, `auth-returning`, `auth-signout`, `theme-toggle`, `shell-mobile`
- Screenshots at 390/768/1440 for `/login`, `/onboarding`, `/app` empty, in both themes → `design-critic`
- axe-core zero violations, both themes
- Reviewers: test-runner, design-critic, code-reviewer, **security-auditor** (auth is in scope)

## Files I may touch
`app/**`, `components/**`, `lib/**`, `styles/**`, `e2e/**`, `tests/**`, `scripts/**`,
`supabase/migrations/*.sql`, root config files.

## Risks and open questions
- Theme flash: solve with a blocking inline script reading the cookie before hydration. Do not solve it with `useEffect`.
- **i18n library choice:** `next-intl` is the default recommendation for App Router. Decide in planning, not mid-build; swapping later is a full-codebase edit.
- Public content routes are **not** locale-prefixed, per decision 7 in the contracts spec. Do not let the i18n library's default routing strategy quietly add `/es/` to public note URLs — that is an SEO regression that is hard to walk back once indexed.
- Institution list at signup: seed with UPV plus the ~50 largest Spanish universities and an "other" free-text path that writes to a moderation queue rather than creating a row. Confirm this approach before building.
