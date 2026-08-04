# Session handoff — phase 00 close attempt

## Status: BLOCKED, on one thing only

Everything on the gate is done except a schema change I did not make, because
`.claude/CLAUDE.md` says contracts changes need your approval and you asked me to wait for
anything needing your intervention. **Four confirmed RLS privilege escalations are live.**
The SQL is written and ready to paste — section "The migration, awaiting approval".

Gate as it stands:

```
typecheck   PASS
lint        PASS   eslint · tokens · i18n · contrast
build       PASS   + new: assert-build-safe (artifact scan)
unit         73 passed   (was 41)
db + RLS     33 passed   ← green over four working escalations. Not evidence.
e2e         128 passed
```

## What changed this session

### Code review findings, actioned

- **`components/ui/button.tsx`** — the dead `onClick` guard was real and is fixed: `onClick` is
  destructured and applied after the spread. `components/ui/button.test.tsx` proves it, using
  `fireEvent` rather than `userEvent` deliberately — userEvent honours `pointer-events`, so it
  would pass whether or not the guard works. Demonstrated failing before the fix, passing after.
- **`lib/cn.ts`** — finding **rejected on evidence**. Eleven adversarial cases (later-colour-wins,
  colour-plus-non-colour, side-specific borders, the real secondary-button class list) all pass
  unchanged. Unlike `text-*`, `bg-*`/`border-*` have no size scale to collide with. Cases kept as
  regression cover, so if a token is ever named `cover` or `solid` one of them fails.

New devDependencies for the component test: `jsdom`, `@testing-library/react`. Component tests
live in the existing `unit` vitest project and opt into jsdom per file.

### design-critic calibration — done, written up in `docs/MEASUREMENT.md`

Caught the hex (by scripting a pixel read and converting OKLCH→sRGB itself), missed the 13px gap,
correctly did not report the 300ms transition. Zero false positives. `.claude/agents/design-critic.md`
now requires per-finding provenance and a "what I did not check" section, and no longer claims
4px-grid conformance.

**The calibration's real finding was about the checker, not the critic:** `lint:tokens` caught
1 of the 3 plants. Its px and duration checks ran on `.css` only, so `style={{ gap: '13px' }}` was
unguarded — while the script's header claimed inline styles were covered. Those two rules were
also the only ones missing from `expectedRules`. Fixed; fixture now carries both syntaxes.

### Security audit — this is the serious part

Every finding below I reproduced myself before accepting it.

**Fixed already:**

1. **`NEXT_PUBLIC_SUPABASE_ANON_KEY` was the `sb_secret_` key** (RLS-bypassing), confirmed by
   SHA-256 against `supabase status`. Any `pnpm build` would have inlined it into a public JS
   chunk. Worse day-to-day: your local app was running with **RLS entirely inert** while
   `test:rls` went green, because the suite reads keys from the CLI and the app reads `.env.local`.
   I rewrote that one line in `.env.local` to the publishable key and verified the app boots
   (`/` 200, `/login` 200, `/app` 307, `/api/test-auth` 404).
2. **`/api/test-auth` shipped in the production manifest**, and its localhost gate was inert:
   `NEXT_PUBLIC_*` is inlined at build time, so it described the *build machine*, not the running
   deployment — while `lib/supabase/server.ts` reads the same var dynamically and connected to the
   real Supabase. Now `route.e2e.ts` + `pageExtensions`, so it is **absent** from a normal build.
   Verified both directions.
3. **Cookie `secure` flag** — `@supabase/ssr` defaults to no `secure` and `httpOnly: false`.
   `secure` is now set in `server.ts` and `middleware.ts`. `httpOnly` remains false and is a known
   open item (the browser client must read the session); noted in the code.
4. **`.gitignore`** — `.env*.local` required the name to *end* in `.local`, so `.env.local.back`
   holding your hosted credentials was untracked but not ignored. Now `.env.*`. Never committed.
5. **`scripts/assert-build-safe.mjs`** (new, wired into `pnpm build`) — scans the artifact for
   test-only routes and secret-shaped material in client bundles. Tested in both directions,
   including the false-positive case.

**Still open, needs you:**

- `.env.local.back` is still in your working tree with a hosted project URL, DB password, Google
  OAuth client secret and hosted `sb_secret_` key. It is gitignored now, but I did not delete
  your file. **Treat those credentials as exposed and rotate them** — I cannot tell whether they
  ever left the machine.
- `proxy.ts`'s matcher excludes any path ending in an image/font extension, so `/app/x.png` skips
  the middleware. Not exploitable today (`app/app/layout.tsx` guards server-side), but it becomes
  exploitable in phase 01 the moment a route under `/app/` bypasses that layout. Low, but real.

### Landing page

You asked for the Google control to actually start OAuth. `app/page.tsx` now renders the real
`GoogleSignInButton` (moved to `components/`, shared with `/login`) instead of a `Link` to
`/login`. There are no remaining links to `/login`, so nothing needed CTA copy. Zero axe
violations at all three widths, both themes.

## The migration, awaiting approval

Root cause of all four escalations is one line in `0001_foundation.sql:290`:
`grant select, insert, update on profiles to authenticated` is **table-level**, so
`profiles_insert_own` / `profiles_update_own` authorise the *row* and nothing constrains the
*columns*. Separately, Postgres grants `EXECUTE` to `PUBLIC` by default, so the migration's
explicit `grant execute ... to authenticated` is decorative and `anon` inherits access anyway.

Reproduced (script kept at `scratchpad/verify-rls.mjs`):

```
ALLOWED  F3 self-grant is_pro                    is_pro=true
ALLOWED  F4 direct insert, chosen slug + is_pro  is_pro=true
ALLOWED  F5 forged status=accepted               status=accepted
ALLOWED  F6 anon claim_profile_slug              returned=verify-a-2
BLOCKED    control: anon select profiles
BLOCKED    control: cross-user update            rows=0
```

Controls behave correctly — cross-user reads and writes are properly blocked, and
`create_profile`'s `auth.uid()` design is sound. The hole is columns, not rows.

Proposed `supabase/migrations/0002_rls_column_grants.sql` — **not created**, since a new migration
is both a schema change and outside phase 00's allowlist:

```sql
-- F3 + F4: columns, not just rows.
revoke insert, update on profiles from authenticated;
grant update (handle, display_name, avatar_url, locale, institution_id, degree_id)
  on profiles to authenticated;
drop policy profiles_insert_own on profiles;
-- create_profile() is security definer, so it inserts regardless of the caller's
-- grant. Removing the policy makes the RPC the only path, which is what the
-- migration's own comment says it intends.

-- F5: the moderation queue decides its own status.
revoke insert on institution_requests from authenticated;
grant insert (user_id, name, country) on institution_requests to authenticated;
drop policy institution_requests_insert_own on institution_requests;
create policy institution_requests_insert_own on institution_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id
              and status = 'pending'
              and resolved_institution_id is null);

-- F6: PUBLIC gets EXECUTE by default. The explicit grants were decorative.
revoke execute on function claim_profile_slug(text), slugify(text),
  profile_slug_base(text), create_profile(text, text, text, uuid, uuid) from public;
grant execute on function create_profile(text, text, text, uuid, uuid) to authenticated;
grant execute on function claim_profile_slug(text), slugify(text),
  profile_slug_base(text) to service_role;
```

Two judgement calls for you, not me:

- **`desired_retention`** — I left it out of the writable column list. If users are meant to tune
  it, it needs its own grant. If it is a phase 03 concern, leaving it service-role-only is right.
- **A reserved-slug denylist** (`admin`, `support`, `help`, `billing`, `formuflash`) inside
  `profile_slug_base`. Worth doing before phase 04 ships public profiles at `/{slug}`, since the
  immutability trigger makes a squat permanent.

Once you approve, the tests go in with it: self-`is_pro` must fail, direct `profiles` insert must
fail, forged `status` must fail, anon `claim_profile_slug` must fail.

## Other things needing you

- **`pnpm db:reset`** — still blocked by the `Bash(supabase db reset:*)` deny rule. Run
  `! pnpm db:start && pnpm db:reset && pnpm test:rls && pnpm test` yourself.
- **Adversarial pass** — fresh session, per `ship-phase` step 6.
- **`packages/contracts/node_modules/`** has 8 pnpm symlinks tracked in git; they churn on every
  dependency bump. I unanchored the ignore rule but did not untrack them, since it is your frozen
  directory: `git rm -r --cached packages/contracts/node_modules`.

## The `test:rls` flake — one new data point

It recurred **once** today, then would not reproduce across six consecutive runs (plus the 22+
from last session). I lost the detail — my grep pattern did not match the output format, and the
rerun passed before I could re-capture.

The new signal: it failed on the run **immediately after** my out-of-band verification script
created and deleted profile rows. That points at contention or leftover state rather than a logic
bug. Still reported, not diagnosed. Next time it appears, capture the full output before anything
else.

## Not done

- `doc-syncer` has not run — the specs still describe `app/api/test-auth/route.ts` at its old path
  and do not mention `assert-build-safe`. Worth running once the migration lands, so it syncs
  against final state rather than twice.
- `scripts/assert-build-safe.mjs` is not yet referenced anywhere in `specs/`.
