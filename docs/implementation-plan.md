# Implementation Plan

## Purpose
Provide a development-ready plan with clear deliverables, dependencies, and verification steps.

## Development start checklist
- Create Supabase project and apply [supabase/schema.sql](../supabase/schema.sql).
- Create storage buckets: note-assets (public read), user-uploads (private).
- Configure environment variables in .env.local:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - GEMINI_API_KEY (or placeholder for BYO keys)
- Decide embedding model and confirm vector dimension in schema.
- Create Stripe products/prices and record price_id/product_id.

## Milestone deliverables

### Milestone 1: Foundation
Deliverables
- Next.js App Router scaffold with Tailwind and shadcn/ui.
- Supabase client utilities (server/client) and typed DB schema.
- Auth flow with Google OAuth and profile bootstrap.
- Public profile page and dashboard shell.
Verification
- User can sign in/out and see a profile page.
- RLS blocks unauthorized reads/writes.

### Milestone 2: Authoring and Study
Deliverables
- Institution/Course/Topic CRUD with slug routing.
- Resource creation (note/deck/exam) with visibility selector.
- CodeMirror editor with Markdown/LaTeX rendering.
- Deck creation, study mode, and FSRS review queue.
Verification
- New resources appear at public URLs.
- Review queue loads in < 200ms for 500 cards.

### Milestone 3: AI and RAG
Deliverables
- Supabase Edge Function for chunking and embeddings.
- Vector search and context assembly service.
- Streaming LLM endpoint with ai SDK.
- Flashcard/exam generation from notes.
Verification
- Inference streams within 1s and never hits Vercel timeouts.
- Chunk updates remove stale vectors and re-embed.

### Milestone 4: Discovery, Billing, and Optimization
Deliverables
- Public discovery feeds and SEO optimizations.
- Stripe checkout, webhooks, and entitlements.
- Ad suppression for paid users and paid-only visibility choices.
- Performance tuning and caching validation.
Verification
- Webhook updates entitlements within 1 minute.
- Free-user forks are public by default.

## Definition of done (global)
- All new features have RLS coverage and server-side checks.
- API handlers return typed errors and log unexpected failures.
- Critical paths have smoke tests or scripted validation.

## Dependencies
- Supabase project and keys.
- Stripe account and webhook secrets.
- Chosen embedding model and vector dimension.

## References
- [docs/requirements.md](requirements.md)
- [docs/architecture.md](architecture.md)
- [docs/data-model.md](data-model.md)
- [docs/billing.md](billing.md)
- [docs/entitlements.md](entitlements.md)
