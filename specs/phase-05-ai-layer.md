# Phase 05 — AI layer

## Goal and why

A student can use AI to do the heavy lifting that surrounds the core loop: turn a lecture PDF into a structured note, ask a copilot to explain/summarize/transform what they have written, and turn a note into a deck of flashcards. The AI features are **progressive enhancement** — the editor, decks, and review engine built in phases 02–04 keep working exactly as they do today with no AI key configured.

Three things must hold:
1. **BYOK key stored encrypted, never returned to the client.** The ciphertext/iv live in `user_api_keys` (migration `0006_ai.sql`, already shipped); `last_four` is the only field the UI ever reads. Decryption happens server-side with `service_role`, never through the `authenticated` role — the column grant discipline from phase 01 (`packages/contracts/src/db.ts` grants `user_api_keys` as `select (user_id, provider, last_four, created_at)`) is what makes this enforceable.
2. **All three call types return valid structured output.** The LLM output is constrained to `NoteDoc` (pdf_to_notes, copilot) and `CardInput[]` (notes_to_cards) — the exact frozen unions from `packages/contracts/src/content.ts` and `schemas.ts`. Invalid output is repaired with a feedback loop before it ever reaches a DB write.
3. **Failures degrade gracefully.** Every AI surface shows an inline error with retry; no AI feature is on the critical path of the core product.

**Why now:** phases 02–04 shipped the content model (NoteDoc + Tiptap), the card model (CardInput + decks/cards CRUD), and the public surfaces. Phase 05 consumes those. Phase 06 (monetization) will gate a pooled key for pro users on top of the BYOK foundation this phase builds — so the `is_pro` flag and the access boundary are designed here, but the pooled-key money path lands in 06.

## Not in this phase

- **A pooled/backend key for free users.** Free users must provide their own BYOK key. Pro-tier pooled key is a phase 06 concern (monetization pays for it). The architecture must not preclude it, but no pooled key is wired here. Decision locked with Carlos: *"Free users BYOK, pro pooled key"* — phase 05 ships BYOK only and the gating UI checks `profiles.is_pro` so phase 06 can add the pooled path without re-plumbing.
- **PDF vision/figure extraction at launch.** We ship text-layer extraction (pdf.js) now and route any non-text-detected PDF (scanned, or one whose extracted text is gibberish) into the **vision architecture** — but the vision call itself is stubbed with a clear `not implemented` error and an inline "this PDF needs vision, coming soon" message. The extraction dispatch is real; the vision branch degrades to a graceful notice. This is the explicit "architecture for vision is there for later" decision.
- **Streaming into the Tiptap doc.** Copilot returns the full response, shows a loading state, then inserts. No token-streaming into editor nodes — that is a phase 06+ polish item (the user chose *non-streaming: full result then insert*).
- **AI for review grading, interval suggestion, or FSRS optimization.** The ADR-001 line holds: scheduling stays library-only. AI touches content creation only.
- **Per-user FSRS weights from AI.** V2, never.
- **Bulk/queue reprocessing, retry workers, cron.** Jobs are processed inline in the server action / route handler (the user chose edge functions / serverless). `ai_jobs` is a write-only audit log this phase, surfaced in key settings; no worker consumes it.
- **Copilot context across notes, or a persistent chat memory.** Copilot sees the current note (or the current selection) only. No cross-note RAG, no memory.

## Contract changes

**None to the schema.** `user_api_keys`, `ai_jobs`, `ai_provider` enum all shipped in `0006_ai.sql` (phase 01). `ApiKeyInput` and `ai_jobs.kind` values (`'pdf_to_notes'`, `'copilot'`, `'notes_to_cards'`) are already frozen in `packages/contracts/src/schemas.ts`.

Two small **contracts package** additions (no migration, approved):

- `packages/contracts/src/schemas.ts`:
  - `AiJobId = z.uuid()` already covered; add `CreateAiNoteInput` and `CreateAiCardsInput` describing the *job request* shape the route handler accepts:
    ```ts
    export const GenerateCardsInput = z.object({
      noteId: z.uuid('content.note.invalid'),
      courseId: z.uuid('content.course.invalid').nullable(),
      target: z.enum(['new_deck', 'existing_deck']),
      deckId: z.uuid('content.deck.invalid').nullable(), // required when target==='existing_deck'
      provider: AiProvider,
    });
    export type GenerateCardsInput = z.infer<typeof GenerateCardsInput>;

    export const PdfToNoteInput = z.object({
      courseId: z.uuid('content.course.invalid').nullable(),
      title: z.string().trim().min(1, 'content.title.required').max(TITLE_MAX, 'content.title.tooLong'),
      provider: AiProvider,
    });
    export type PdfToNoteInput = z.infer<typeof PdfToNoteInput>;

    export const CopilotInput = z.object({
      noteId: z.uuid('content.note.invalid'),
      action: z.enum(['generate', 'explain', 'summarize', 'rephrase', 'continue', 'fix_latex']),
      prompt: z.string().max(4000, 'ai.prompt.tooLong').optional(), // free-text when action==='generate'
      selectionText: z.string().nullable(), // the current editor selection, or null for whole-doc
      provider: AiProvider,
    });
    export type CopilotInput = z.infer<typeof CopilotInput>;
    ```
  - Reuse the existing `AiProvider` (typed against `ai_provider` enum) rather than a bare `z.enum` — same discipline as `Confidence` in `CardInput`.
- `packages/contracts/src/index.ts`: export the three new input schemas.
- `packages/contracts/src/db.ts`: **no regeneration** — these are app-layer request shapes, not DB row shapes. Confirmed with Carlos: the DB contract is frozen; only `schemas.ts` grows.

No `packages/contracts/src/{srs,content}.ts` changes. The AI output is validated against the *existing* `NoteDoc` (from `content.ts`) and `CardInput` (from `schemas.ts`) — we do not add a new union.

## Routes and server actions

| Path | Method | Input type | Output type | Auth |
|---|---|---|---|---|
| `/app/settings/ai-keys` | GET | — | key-management page (lists providers, `last_four`, recent `ai_jobs`) | owner |
| `saveApiKey` action | POST | `ApiKeyInput` | `{ savedAt }` | owner |
| `deleteApiKey` action | POST | `{ provider }` | `{}` | owner |
| `/app/notes/[id]/ai/generate-cards` | POST (server action) | `GenerateCardsInput` | `{ jobId, deckId }` | owner of note |
| `/api/ai/pdf-to-note` | POST (route handler) | `PdfToNoteInput` + multipart PDF | `{ noteId }` | owner |
| `/api/ai/copilot` | POST (route handler) | `CopilotInput` | `{ noteDoc? : NoteDoc, text?: string }` | owner of note |
| `getApiKeyStatus` action | POST | — | `{ hasKeys: Record<provider, boolean>, isPro }` | owner |

**Access notes:**
- Every AI action/route reads the caller's `user_api_keys` row via `service_role` (server-side, never client). If the user has no key for the chosen `provider`, the action returns `err('ai.noKey')` and the UI opens the inline "add API key" dialog.
- `profiles.is_pro` is read on every AI entry to reserve the pooled-key path for phase 06. This phase: `is_pro` is used only to decide whether to *show* a "pro gets a pooled key soon" hint; it never unlocks anything.
- `noteId` / `deckId` ownership is re-checked server-side (never trust the client's id) — same discipline as `getNote` / `getDeck`.
- The three AI routes are **outside** the review route group and the editor canvas. The review session (design-system §7) stays ad-free and AI-free. AI never appears inside `/review`.

**The AI processing boundary (authoritative):**

```
server action / route
  ├─ auth: getSessionUser()                      → 401 if null
  ├─ load + decrypt key (service_role)           → err('ai.noKey') if absent
  ├─ build prompt from frozen union (NoteDoc / CardInput)
  ├─ call provider SDK (structured output)       → err('ai.providerError') on 4xx/5xx
  ├─ validate response with Zod (NoteDoc / CardInput[])
  │     └─ on invalid: repair loop (max 2 retries, feed error back)
  │           └─ still invalid → err('ai.invalidOutput')
  ├─ write ai_jobs row (input/output tokens)     → audit only, no UI dependency
  └─ persist (note / deck+cards) or return doc
```

`apply_review` is **not** in this path. AI writes are ordinary `insert`/`update` through `lib/db/notes.ts` / `lib/db/cards.ts`, exactly like the manual flows.

## Component inventory

| Component | File | Client/Server | States it must handle |
|---|---|---|---|
| `AiKeysSettingsPage` | `app/app/settings/ai-keys/page.tsx` | server (lists keys + jobs) + client form islands | loading, empty (no keys), populated (per-provider `last_four` + delete), error |
| `ApiKeyForm` | `components/ai/api-key-form.tsx` | client | idle, pending, field-error (catalog key), saved, delete-confirm dialog |
| `AddApiKeyDialog` | `components/ai/add-api-key-dialog.tsx` | client | open from no-key state, provider picker, key input, error, success → re-invokes the blocked AI call |
| `CopilotMenu` | `components/ai/copilot-menu.tsx` | client | idle, generating (loading), result (insert/replace), error+retry; 6 verbs from slash menu + selection toolbar |
| `PdfToNoteButton` | `components/ai/pdf-to-note-button.tsx` | client | idle, uploading (progress), processing, done (redirect to note), error+retry |
| `GenerateCardsButton` | `components/ai/generate-cards-button.tsx` | client | idle, configuring (new deck vs existing + course/deck picker), processing, toast+link, error+retry |
| `AiJobList` | `components/ai/ai-job-list.tsx` | server (reads `ai_jobs` as owner) | empty, populated (provider, kind, tokens, time), error |
| `SlashMenu` (modify) | `components/editor/slash-menu.tsx` | client | **add** AI items (`generate`, `explain`, `summarize`, `rephrase`, `continue`, `fix_latex`) — only when a key exists for the selected provider |
| `SelectionToolbar` (modify) | `components/editor/selection-toolbar.tsx` | client | **add** "Ask AI" action → opens `CopilotMenu` with the current selection |
| `NoteEditor` (modify) | `components/editor/note-editor.tsx` | client | wire `CopilotMenu` entry points; pass selection text to copilot calls |

**No new `ui` primitives.** Reuse `Button`, `Input`, `Select`, `Dialog`, `EmptyState` from `components/ui/**` (phase 00/03b rule 3). If a primitive is missing, stop and ask.

**Nav** — `components/layout/app-shell.tsx`: add `{ href: '/app/settings/ai-keys', label: t('settings.aiKeys') }` to `navItems` (the `nav.settings` key already exists; add `aiKeys` under it). No new top-level nav entry — AI keys live under Settings.

## Prompt engineering contract (the frozen-union discipline)

The model is told, in the system prompt, that it has access to a **rich Markdown + LaTeX editor** and must exploit it: headings, bullet/ordered lists, code blocks, blockquotes, inline math (`$…$`), and display math (`$$…$$`). The output schema for each call type:

- **pdf_to_notes** → `NoteDoc` (the frozen union from `content.ts`). The prompt instructs: extract the lecture's structure, render every equation as `displayMath`/`inlineMath` with valid LaTeX, preserve code blocks, use headings for sections. Confidence is N/A (it's a note).
- **copilot** → depends on `action`:
  - `generate` → `NoteDoc` (insert as new content) OR plain `text` (insert at cursor). The prompt says: produce well-structured notes with math where appropriate.
  - `explain` / `summarize` / `rephrase` / `continue` / `fix_latex` → `text` (replace selection, or append). `fix_latex` specifically: take the selection, repair malformed LaTeX, return corrected `text` with valid `$…$`/`$$…$$`.
- **notes_to_cards** → `CardInput[]` (frozen schema). The prompt instructs: for each card, `frontJson` and `backJson` are `NoteDoc` (so a card front can contain a display equation), `confidence` is **always `'again'`** (the user's explicit rule: *"by default the confidence will always be the lowest as it hasn't been studied yet"* — the model has no recall data, so `again` is the honest default), `position` is the array index. `deckId` is supplied by the caller; the cards are inserted via `createCard` (reusing phase 03's path).

The **repair loop**: if the provider's structured output fails Zod, the action feeds the Zod error message back as a follow-up turn ("Your output did not match the schema: <error>. Return valid JSON.") up to 2 times. After 2 failures → `err('ai.invalidOutput')`.

## BYOK encryption (server-side, Web Crypto / node:crypto)

Per Carlos: *"pick the simplest secure option."* Use **Node's built-in `crypto`** (AES-256-GCM) in the server action / route handler — these run in the Node runtime, not Edge. Key from `SUPABASE_SERVICE_ROLE` + an env `AI_KEY_ENCRYPTION_KEY` (32 bytes, hex or base64). Never commit the key; document it in `.env.example` as `AI_KEY_ENCRYPTION_KEY=`.

- `lib/ai/crypto.ts` (new):
  - `encryptKey(plaintext: string): { ciphertext: string; iv: string; lastFour: string }` — `lastFour` = last 4 chars of the key (for display), `ciphertext`/`iv` hex-encoded bytea-compatible strings.
  - `decryptKey(ciphertext: string, iv: string): string` — server-only, used by the AI route before calling the provider SDK.
  - AES-256-GCM: `randomBytes(12)` IV per key, `createCipheriv('aes-256-gcm', key, iv)`. Auth tag appended/verified (GCM verifies integrity).
- The `user_api_keys` row stores `ciphertext` (bytea), `iv` (bytea), `last_four` (char(4)) — exactly the `0006_ai.sql` shape. `ApiKeyInput.apiKey` (raw string) is encrypted **before** insert; the raw string never touches `user_api_keys` and is never logged.
- `last_four` is computed server-side from the raw key, never trusted from the client.
- Decryption uses `service_role` client (bypasses RLS) — the `authenticated` role has no `select` on `ciphertext`/`iv` (phase 01 grant), so even a malicious caller owning their own row cannot read their own key back through the anon/authenticated grant. The app reads it only with `service_role`.

**Security-auditor scope:** `lib/ai/crypto.ts`, the `saveApiKey`/`deleteApiKey` actions (grant discipline: insert on `(user_id, provider, ciphertext, iv, last_four)` only), and the `service_role` read path in the AI routes. The `user_api_keys` SELECT grant in `0007` already omits `ciphertext`/`iv` — verify it still holds after this phase (no migration, but the auditor re-confirms).

## PDF extraction (text now, vision later)

`lib/ai/pdf.ts` (new):
- `extractPdfText(file: File | Buffer): Promise<{ text: string; needsVision: boolean }>` — uses `pdfjs-dist` (client-side in `PdfToNoteButton`, or server-side in the route). If extracted text length < threshold (e.g. < 50 chars after trimming) **or** contains no alphanumeric runs (scanned/gibberish), set `needsVision = true`.
- When `needsVision`, the route returns `err('ai.needsVision')` and the UI shows the inline notice *"This PDF looks scanned or image-based. Vision extraction is coming soon — you can paste the text manually."* The **dispatch logic is real** (text vs vision branch exists); only the vision branch is stubbed. This satisfies Carlos's *"if something non-text is detected like a graph or figure or scanned pdf, use vision"* — the detection is live, the vision call is deferred.
- For text PDFs: the extracted text is sent to the LLM with the `NoteDoc` output contract. The LLM structures it.

**Why pdf.js and not direct-to-LLM:** cheaper, private (text never leaves the client before the LLM call), and the vision fallback is explicit. The user accepted this tradeoff.

## Routes — removal / no-op

- No routes removed. Phase 05 is additive.
- The review route (`app/(review)/...`) is **never** touched by AI. No copilot inside review. Confirmed: design-system §7 says the review screen has "no nav, no sidebar, no ads, ever" — AI is likewise excluded.

## Acceptance criteria

1. A signed-in user with **no** AI key sees no AI affordances in the editor slash menu or selection toolbar, and the settings page shows the empty state with an "Add API key" action. The core product is unchanged.
2. A user adds an OpenAI key via the settings form; the form shows `last_four` (not the full key); reloading the settings page shows the key with a delete action; the raw key is never present in any client bundle (verified by `assert-build-safe` patterns + a test that the ciphertext column is not in the `authenticated` SELECT grant).
3. Adding a key for a provider that fails `ApiKeyInput` validation shows a catalog-key error, not a 500; the key is not stored.
4. A user with a valid key uploads a **text-layer PDF**; the app extracts text, sends it to the LLM with the `NoteDoc` contract; on completion it redirects to a **new note** whose `content_json` is a valid `NoteDoc` (headings, lists, and at least one `displayMath`/`inlineMath` node when the source had equations) and whose `content_text` is the readable projection.
5. The same PDF flow with a **scanned PDF** (no extractable text) shows the inline "needs vision, coming soon" notice and does **not** call the LLM or create a note. The text/vision dispatch branch is exercised by a unit test feeding a zero-text buffer.
6. Copilot `generate` from the slash menu, with a selection, returns a `NoteDoc` that inserts at the cursor; `explain`/`summarize`/`rephrase`/`continue` return `text` that replaces the selection (or appends at cursor when no selection); `fix_latex` returns corrected text with valid `$…$`/`$$…$$` and the result round-trips through `proseToUnion` without error.
7. A copilot call whose LLM returns malformed JSON is repaired (Zod error fed back) up to 2 times; if still invalid, the user sees `err('ai.invalidOutput')` with a retry button and no partial content is inserted.
8. A copilot call that throws (provider 4xx/5xx/network) shows `err('ai.providerError')` with retry; the editor content is unchanged.
9. `notes_to_cards` with `target: 'new_deck'` creates a deck (under the chosen course) plus N cards, each with `confidence: 'again'`, valid `frontJson`/`backJson` `NoteDoc`, and `position` = index; the user gets a toast "N cards generated" with a link to `/app/decks/[id]`; opening that deck shows the generated cards in the card list.
10. `notes_to_cards` with `target: 'existing_deck'` appends the generated cards to that deck (owner-checked); the card list grows by N.
11. Every AI call writes an `ai_jobs` row (provider, kind, input_tokens, output_tokens, status `'done'`/`'error'`, error if any); the key settings page lists recent jobs.
12. A user with **no key** for the chosen provider who triggers an AI feature sees the inline "Add API key" dialog; on save, the original AI call is retried automatically. No navigation away from the editor/note.
13. A non-owner calling `generate-cards` with someone else's `noteId` (or `existing_deck` they don't own) gets `err('error.unexpected')` / 404 — ownership is re-checked server-side, not trusted from the client.
14. `profiles.is_pro` is read on every AI entry but unlocks nothing this phase; the UI may show a "pro gets a pooled key" hint only.
15. At 390px the AI dialogs and the copilot result panel are usable: no horizontal scroll, targets ≥ 44px, the result panel does not cover the editor irrecoverably (an explicit close/insert dismisses it).
16. With `prefers-reduced-motion`, the copilot loading state and dialog transitions respect §5 (1ms, no flip).
17. All new UI strings exist in `en` and `es`; every error is a catalog key (`pnpm lint:i18n` passes).
18. The review route contains zero AI code paths (grep-level invariant: no `copilot`/`generate` import under `app/(review)/`).

## Verification

**Commands** (in order): `pnpm db:reset` → `pnpm db:types` → `pnpm typecheck && pnpm lint && pnpm build` → `pnpm test:rls` (extend `tests/rls/progress.test.ts`: `user_api_keys` ciphertext/iv are NOT in the `authenticated` SELECT grant — re-confirm the phase-01 invariant holds) → `pnpm test` (new unit tests below) → `pnpm test:e2e`.

**New unit tests** (`tests/` or `packages/contracts`):
- `lib/ai/crypto.test.ts` — encrypt→decrypt round-trips; `last_four` is last 4 chars; wrong key fails GCM auth tag (tamper detection); IV is 12 bytes.
- `lib/ai/pdf.test.ts` — text-layer PDF yields `needsVision: false` with extractable text; zero-text/garbage buffer yields `needsVision: true`. (Uses a committed fixture PDF + a generated empty one.)
- `lib/ai/validate-output.test.ts` — a malformed LLM response fails Zod; the repair loop feeds the error back; after 2 failures returns `invalidOutput`. (Mock the provider SDK.)
- `tests/rls/user-api-keys.test.ts` — extend the phase-01 `grants.test.ts` assertion: `ciphertext`/`iv` absent from `authenticated` SELECT grant on `user_api_keys`.

**New e2e specs** (`e2e/ai/`), seeded via the existing admin-client fixture helpers:
- `ai-no-key-empty-state` — no key → no AI affordances, settings empty state.
- `ai-add-key` — add OpenAI key → `last_four` shown, reload persists, delete works. **Assert no `sk-` substring in any network response body or `__NEXT_DATA__`** (secret-leak check, same discipline as phase 00 `assert-build-safe`).
- `ai-pdf-to-note` — upload text PDF → redirect to new note → note has valid `NoteDoc` (assert `content_json` parses and contains a `displayMath`/`inlineMath` node when the fixture has an equation).
- `ai-pdf-scanned` — upload scanned PDF → inline notice, no note created.
- `ai-copilot-generate` — slash menu `generate` → insert at cursor.
- `ai-copilot-transform` — select text → `explain`/`rephrase`/`fix_latex` → replaces selection, round-trips through `proseToUnion`.
- `ai-notes-to-cards-new-deck` — generate → toast + new deck with N cards, `confidence: 'again'`.
- `ai-notes-to-cards-existing-deck` — generate → appends to existing deck.
- `ai-invalid-output-retry` — mock provider returns bad JSON → repair → retry button.
- `ai-no-key-dialog` — trigger AI with no key → inline dialog → save key → retry succeeds.
- `screenshots.spec.ts` additions: settings/ai-keys empty + populated, copilot result panel, pdf-to-note processing, generate-cards configuring dialog × dark/light × 390/768/1440.

**Reviewers**: `test-runner` (commands above), `design-critic` (screenshots against `refs/` + `specs/design-system.md` §6/§7), `code-reviewer` (diff), `security-auditor` (`lib/ai/crypto.ts`, the `saveApiKey`/`deleteApiKey` grant discipline, the `service_role` read path, and the `user_api_keys` SELECT-grant invariant).

## Files I may touch

- `specs/phase-05-ai-layer.md` (new — this document, materialised on approval)
- `packages/contracts/src/schemas.ts`, `packages/contracts/src/index.ts` (add `GenerateCardsInput`, `PdfToNoteInput`, `CopilotInput`; no `db.ts` regeneration)
- `app/app/settings/ai-keys/page.tsx` (new), `app/app/notes/[id]/ai/generate-cards/actions.ts` (new server action), `app/api/ai/pdf-to-note/route.ts` (new), `app/api/ai/copilot/route.ts` (new)
- `components/ai/**` (new: `api-key-form.tsx`, `add-api-key-dialog.tsx`, `copilot-menu.tsx`, `pdf-to-note-button.tsx`, `generate-cards-button.tsx`, `ai-job-list.tsx`)
- `components/editor/slash-menu.tsx` (modify: add AI items), `components/editor/selection-toolbar.tsx` (modify: add "Ask AI"), `components/editor/note-editor.tsx` (modify: wire copilot entry)
- `lib/ai/**` (new: `crypto.ts`, `pdf.ts`, `providers/` — `openai.ts`, `anthropic.ts`, `google.ts`, `validate-output.ts`, `prompts.ts`)
- `lib/db/ai-keys.ts` (new: `saveApiKeyRow`, `deleteApiKeyRow`, `getApiKeyStatus`, `listAiJobs` — all via `service_role`)
- `components/layout/app-shell.tsx` (navItems += ai-keys under settings)
- `messages/en.json`, `messages/es.json` (new `ai` namespace + `settings.aiKeys` key)
- `e2e/ai/**`, `tests/rls/user-api-keys.test.ts`, `lib/ai/crypto.test.ts`, `lib/ai/pdf.test.ts`, `lib/ai/validate-output.test.ts`
- `.env.example` (document `AI_KEY_ENCRYPTION_KEY=`)
- `scripts/seed-dev.mjs` (optional: seed one user with a dummy BYOK key for local browsing)

**Do not touch:** `packages/contracts/src/{srs,content}.ts` (frozen), `supabase/migrations/0001–0012` (no migration this phase), `components/ui/**` (reuse, don't invent), `lib/editor/serialize.ts` (import `proseToUnion`/`unionToProse`, don't modify), `app/(review)/**` (AI-free by design), `lib/db/{notes,decks,cards}.ts` internals (call them, don't rewrite — except to add the AI entry points that reuse existing `createCard`/`createNoteRow`).

## Risks and open questions

1. **The `user_api_keys` SELECT grant is the whole security boundary.** If this phase accidentally grants `authenticated` `select` on `ciphertext`/`iv`, every user can read their own key — and a future bug could expose others'. The phase-01 grant omits them; `security-auditor` re-confirms and `tests/rls/user-api-keys.test.ts` pins it. *Same shape as the phase-01 RLS escalations* — a column grant is easy to add by mistake and silent until exploited.
2. **Provider SDK structured-output differences.** OpenAI JSON mode, Anthropic tool use, Google structured output each have different wire shapes. `lib/ai/providers/*` abstract this; the validation step (Zod against `NoteDoc`/`CardInput`) is provider-agnostic and is the real guarantee. The repair loop must work across all three — test it with a mocked provider returning the *worst* output.
3. **`fix_latex` round-trip.** The model returns corrected `text`; inserting it must not double-render math. The selection-replace path in `note-editor.tsx` must handle a string that contains `$…$` by re-parsing through the math extension, not inserting literal `$`. Verify with a fixture.
4. **PDF.js in the bundler.** `pdfjs-dist` is large; import it dynamically (`next/dynamic` or `await import`) so it doesn't bloat the editor chunk. The review route must not pull it in (AI-free). Confirm via `assert-build-safe` / bundle analysis.
5. **`ai_jobs` write volume.** Every call writes a row. At scale this is fine (it's an append-only audit log); this phase surfaces it in settings but phase 06 may aggregate it for billing. No index change needed now (PK is uuid, queried by `user_id` + `created_at` — add a partial index if the settings list gets slow; defer until measured).
6. **The repair loop costs tokens.** 2 retries on a malformed response doubles the call cost in the worst case. Acceptable for MVP; flag for phase 06 if it shows up in `ai_jobs` token totals.
7. **Vision branch is stubbed.** The detection is real (text vs vision), but the vision call returns `err('ai.needsVision')`. A student with a scanned PDF gets a graceful notice, not a broken flow. The architecture (a `vision` provider method that today throws `not implemented`) is in place so phase 06+ can fill it without restructuring.
8. **No pooled key this phase.** Free users with no BYOK key see AI disabled. This is the intended MVP; phase 06 adds the pro pooled key. The `is_pro` check is already wired so phase 06 is a small diff, not a re-plumb.
9. **Copilot context is the current note only.** No cross-note RAG, no memory. A student who wants the copilot to know another note must paste it. Deliberate MVP scope; the prompt builder takes `(noteDoc, selectionText)` and nothing else.
