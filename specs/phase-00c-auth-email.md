# Phase 00c — Email + password auth

## Goal and why
A student without a Google account can create an account with an email and password and reach the same onboarding → `/app` path a Google user takes. Password auth is the second half of "sign in" for a product whose identity layer is otherwise a single provider — the sign-in screen should not turn people away for lacking a Google account.

The second reason is local testing. Google OAuth cannot be driven by an automated browser (Google blocks it), which is why the current suite signs in through the admin API and the test-only `/api/test-auth` route. Password auth works against the local Supabase stack with no OAuth at all, so the signup and sign-in UI itself becomes drivable end-to-end.

Everything after auth (onboarding, profile creation, dashboard) is reused untouched. The profile is still created at the end of onboarding via the existing `create_profile()` RPC; the username (`profiles.handle`) is still chosen there, exactly as Google users do today. An email/password user is just an `auth.users` row with `email` + `password` and no Google identity — `resolveAppEntry` already routes "signed in, no profile" → `/onboarding`.

## Not in this phase
Password reset / "forgot password". Resend-confirmation UI. Changing a password while signed in. Linking or unlinking identities (Google account linking). A "show password" toggle (would need a `components/ui/**` edit — see Risks). Any change to `packages/contracts/`, `supabase/migrations/*`, `supabase/config.toml`, or the landing page CTA (`app/page.tsx` stays Google-only, deliberately).

## Contract changes
None. `packages/contracts/` is frozen. No new columns, no new tables, no new grants: email lives in `auth.users`, the profile is still created at onboarding, and signup only creates the auth user.

Two facts the implementer must not re-litigate:
- **No `components/ui/**` edit is needed.** `Input` forwards `type` via `{...props}` (`components/ui/input.tsx:44`), so `type="email"` / `type="password"` already work. This is not a ROADMAP rule-3 "new primitive" situation; do not add a `type` prop and do not stop to ask.
- **Local vs hosted confirmation split.** Locally `supabase/config.toml` has `enable_confirmations = false`, so `signUp` returns a session immediately and flows straight to onboarding. Hosted projects almost always enable confirmations, where `signUp` returns no session — the signup form must surface a "check your email" state instead of failing. The local e2e stack can only exercise the no-confirmation path; the confirmation path is a manual hosted check (same standing as Google OAuth).

## Routes and server actions
| Path | Method | Input | Output | Auth |
|---|---|---|---|---|
| `/login` | GET | — | email+password form, Google below | public |
| `/login` | POST (action `signInWithPassword`) | `email`, `password` | session cookie; `redirect('/app')` | public |
| `/signup` | GET | — | value prop, Google, email signup form | public |
| `/signup` | POST (action `signUp`) | `email`, `password`, `passwordConfirm` | session, or `{ status: 'check-email' }` | public |
| `/auth/callback` | GET | `code` OR `token_hash` + `type` | redirect `/onboarding` or `/app` | public |

Both actions are `'use server'` with the cookie-scoped server client (`lib/supabase/server.ts`) — the session cookie is written by `@supabase/ssr` on the same request, exactly as `/api/test-auth/route.e2e.ts` already proves. **No browser client, no PKCE**; PKCE exists only for the OAuth redirect leg. Post-auth redirect is `redirect('/app')` — the layout's `resolveAppEntry` sends a no-profile user to `/onboarding`, so the action never duplicates the callback's `hasProfile` branch and the EVOLUTION infinite-redirect protection stays intact.

## Component inventory
| Component | File | Client/Server | States |
|---|---|---|---|
| `AuthShell` | `components/auth/auth-shell.tsx` | server | brand + login/signup toggle link |
| `EmailPasswordSignInForm` | `components/auth/email-password-sign-in-form.tsx` | client | idle, pending, field error, form error |
| `EmailPasswordSignUpForm` | `components/auth/email-password-sign-up-form.tsx` | client | idle, pending, field error, form error, **check-email** |
| `GoogleSignInButton` | `components/google-sign-in-button.tsx` (add `variant`) | client | idle, pending, error → `/login?error=oauth` |

## Acceptance criteria
1. A new user signs up at `/signup` with an email and password. With email confirmations enabled (hosted), they see a "check your email" panel — not an error — and are not signed in; opening the confirmation link returns them to the app and sends them through onboarding to `/app`.
2. With email confirmations disabled (local stack), email signup takes the user straight to onboarding; completing onboarding creates the profile and lands them on `/app`.
3. A returning user signs in at `/login` with email + password and lands directly on `/app`, never seeing onboarding.
4. Signing in with the wrong password shows an inline error on `/login` and does not navigate away; the typed email is preserved.
5. Signing up with an email that already has an account shows an inline "already exists" error on `/signup`.
6. An unconfirmed user who tries to sign in at `/login` is told their email is not confirmed yet.
7. A signed-in user who visits `/login` or `/signup` is redirected to `/app`.
8. Google sign-in still works from `/login`, `/signup`, and the landing page; an OAuth failure still shows the existing `?error=` alert on `/login`.
9. `login.subtitle` no longer claims Google-only, and every new string renders in English and Spanish — `pnpm lint:i18n` passes.
10. Each auth screen has exactly one primary button (design-system §7); tabbing shows a visible focus ring on every control; at 390px there is no horizontal scroll; the pseudo-locale pass shows no overflow.

## Verification
- Commands: `pnpm typecheck && pnpm lint && pnpm build` (zero warnings; `lint` chains `lint:tokens`, `lint:i18n`, `lint:contrast`), `pnpm test`, `pnpm test:e2e`.
- Playwright flows to add: `auth-email-signup`, `auth-email-login`, `auth-email-wrong-password`, `auth-email-duplicate-signup`, `auth-email-unconfirmed-login`, `auth-signup-redirect`. Existing flows (`auth-signup`, `auth-returning`, `auth-signout`, `guards`) stay green.
- Screenshots at 390/768/1440, both themes, for `/login` and `/signup` → `design-critic` against `refs/06-auth/`.
- Manual check against the hosted project (same standing as the Google manual check): full email-confirmation round trip — sign up, open the confirmation email, click the link, land in onboarding, complete → `/app`. Verify `/auth/callback` is an allowed redirect URL in the hosted dashboard.
- Reviewers: test-runner, design-critic, code-reviewer, **security-auditor** (auth is in scope — same requirement as phase-00 line 73).

## Files I may touch
`specs/phase-00c-auth-email.md` (new), `app/login/page.tsx`, `app/login/actions.ts` (new), `app/signup/page.tsx` (new), `app/signup/actions.ts` (new), `app/auth/callback/route.ts`, `app/onboarding/page.tsx` (suggested-name fallback only), `components/auth/**` (new), `components/google-sign-in-button.tsx` (variant prop), `lib/supabase/middleware.ts`, `messages/en.json`, `messages/es.json`, `e2e/auth-email.spec.ts` (new), `e2e/fixtures/auth.ts`, `e2e/screenshots.spec.ts`.

**Not** `packages/contracts/**`, **not** `components/ui/**`, **not** `supabase/migrations/*`, **not** `supabase/config.toml`, **not** `app/page.tsx`, **not** `app/onboarding/actions.ts`.

## Risks and open questions
- **Confirmation return-leg format (highest risk).** GoTrue redirects confirmation links with `token_hash` + `type` (modern PKCE email flow) or `code` (older config). The callback handles both, but the real shape must be confirmed against the hosted project — same hand-verification status as Google OAuth.
- **Check-email UI is hosted-only.** Locally confirmations are off, so that panel is verified by the manual hosted check plus the e2e-covered unconfirmed-login error. Thin state-driven UI; low risk.
- **Server-action cookie flush on redirect.** The cookie-scoped client + `redirect('/app')` pattern is proven by `/api/test-auth` and the callback, but worth a local smoke test: sign up, land in onboarding, reload — still signed in.
- **Password-minimum copy** says "≥ 6 characters" (matches `minimum_password_length = 6`). If the hosted project enforces stronger rules, the server's `weak_password` mapping is authoritative — adjust copy after verifying hosted settings.
- **Landing page CTA** stays Google-only. Not wrong, but under-advertises email; out of scope.
- **No password reset / resend** in scope — a user who forgets their password or loses the confirmation email is stuck until a later phase.
- **Signup primary-per-region.** Per `refs/06-auth` the signup page lists OAuth first in layout order; per design-system §7 there is exactly one primary button, which is the email form's submit. Google is styled `secondary`. The check-email panel replaces the form section but leaves the Google button visible — flag for design-critic whether it should hide.
