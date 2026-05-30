# LLM-Friendly Deliverables

Each item is a small, testable chunk with clear outputs. Avoid mixing workstreams in a single task.

## Foundation

**F1: App scaffold**
- Scope: Next.js App Router, Tailwind, shadcn/ui, linting.
- Outputs: package.json, app/layout.tsx, styles/globals.css.
- Dependencies: none.
- Acceptance: `npm run lint` and `npm run build` pass.

**F2: Supabase client utilities**
- Scope: server/client clients, auth helpers, typed DB file.
- Outputs: lib/supabase/*, lib/auth/*.
- Dependencies: F1.
- Acceptance: server action can read profiles table under RLS.

**F3: Auth and profile bootstrap**
- Scope: Google OAuth login/logout, create profile on first login.
- Outputs: app/(app)/layout.tsx, server/actions/auth.
- Dependencies: F2.
- Acceptance: new user gets a profile row after sign-in.

## Core hierarchy

**H1: Institution CRUD**
- Scope: create/list/show institutions by slug.
- Outputs: app/(app)/[institution] routes, server actions.
- Dependencies: F2, F3.
- Acceptance: public institution pages render via RSC.

**H2: Course CRUD**
- Scope: create/list/show courses under institution.
- Outputs: app/(app)/[institution]/[course].
- Dependencies: H1.
- Acceptance: slug uniqueness enforced on create.

**H3: Topic CRUD**
- Scope: create/list/show topics under course.
- Outputs: app/(app)/[institution]/[course]/[topic].
- Dependencies: H2.
- Acceptance: RLS prevents cross-owner writes.

**H4: Resource creation**
- Scope: create resource (note/deck/exam) with visibility.
- Outputs: server actions + resource routes.
- Dependencies: H3.
- Acceptance: resource shows in topic view.

## Notes

**N1: CodeMirror editor**
- Scope: client-only editor with dynamic import.
- Outputs: components/editor/*.
- Dependencies: F1.
- Acceptance: editor renders in edit routes without SSR errors.

**N2: Note storage**
- Scope: save/load notes, markdown rendering.
- Outputs: server actions for notes, components/notes.
- Dependencies: H4, N1.
- Acceptance: note page renders Markdown + LaTeX.

**N3: Image upload**
- Scope: Supabase storage upload for note assets.
- Outputs: components/notes/ImageUploader.
- Dependencies: N2.
- Acceptance: uploaded image appears in note.

## Decks and FSRS

**D1: Deck CRUD**
- Scope: add/edit/remove flashcards.
- Outputs: components/deck/*.
- Dependencies: H4.
- Acceptance: deck page lists cards in order.

**D2: Review queue**
- Scope: fetch review_queue_cache and render study session.
- Outputs: components/deck/ReviewSession.
- Dependencies: D1.
- Acceptance: due cards are returned for today.

**D3: FSRS update flow**
- Scope: edge route updates fsrs_state after review.
- Outputs: app/api/review/queue/route.ts.
- Dependencies: D2.
- Acceptance: next due_at reflects FSRS calculation.

## Exams

**E1: Exam builder**
- Scope: create exam with ordered items.
- Outputs: components/exam/*.
- Dependencies: H4.
- Acceptance: MCQ and longform items render correctly.

## RAG and AI

**A1: Chunking worker**
- Scope: Supabase Edge Function chunking notes and inserting note_chunks.
- Outputs: supabase/functions/chunk-notes.
- Dependencies: N2.
- Acceptance: note_chunks generated for a note edit.

**A2: Embedding ingestion**
- Scope: embed chunks and update vector column.
- Outputs: supabase/functions/embeddings.
- Dependencies: A1.
- Acceptance: vector search returns matches.

**A3: Vector search API**
- Scope: search top-k chunks for a note/topic.
- Outputs: server/queries/rag.
- Dependencies: A2.
- Acceptance: query returns deterministic results for a sample input.

**A4: Streaming LLM**
- Scope: streamText route with ai SDK.
- Outputs: app/api/llm/stream/route.ts.
- Dependencies: A3.
- Acceptance: responses stream within 1s and complete under Vercel limits.

**A5: Auto-generation**
- Scope: create decks/exams from LLM output.
- Outputs: server/actions/ai-generate.
- Dependencies: A4.
- Acceptance: generated content is persisted and viewable.

## Billing and entitlements

**B1: Stripe checkout**
- Scope: create Checkout Session and redirect.
- Outputs: app/api/stripe/checkout/route.ts.
- Dependencies: F2.
- Acceptance: successful checkout creates a Stripe subscription.

**B2: Stripe webhooks**
- Scope: webhook handler updates Supabase billing tables.
- Outputs: app/api/stripe/webhook/route.ts.
- Dependencies: B1.
- Acceptance: subscription changes update the user entitlements.

**B3: Entitlements gate**
- Scope: suppress ads and restrict visibility choices.
- Outputs: components/ads/AdSlot.tsx, components/sharing/VisibilityPicker.tsx.
- Dependencies: B2.
- Acceptance: paid users see no ads and can set private/collab visibility.

## Discovery and SEO

**S1: Public profiles**
- Scope: public user pages with public resources.
- Outputs: app/(app)/user/[username]/page.tsx.
- Dependencies: H1-H4.
- Acceptance: only public resources appear.

**S2: Discovery feeds**
- Scope: public browse pages with pagination.
- Outputs: app/(marketing)/discover.
- Dependencies: S1.
- Acceptance: infinite query loads more results.

**S3: SEO enhancements**
- Scope: metadata, sitemap, robots, OpenGraph.
- Outputs: app/sitemap.ts, app/robots.ts.
- Dependencies: S2.
- Acceptance: pages contain canonical URLs and metadata.
