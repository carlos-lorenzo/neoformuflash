# Formuflash Architecture Blueprint

## Goals and constraints
- Next.js App Router with React Server Components for SEO and fast navigation.
- Vercel free tier 10s limit drives streaming and offloading strategies.
- Supabase PostgreSQL with pgvector for RAG, Auth (Google OAuth), Storage for images.
- CodeMirror 6 editor, dynamically imported to avoid RSC build failures.

## Runtime placement
- Vercel Edge Routes: stream LLM responses and short-lived orchestration.
- Supabase Edge Functions: long-running chunking, embedding, and bulk operations.
- Supabase Postgres RPC: heavy data operations (forking) and set-based cleanup.

## Data hierarchy and sharing
- Institution -> Course -> Topic -> Resource (note, deck, exam).
- Each entity supports visibility: public, private, collaborators.
- Collaborators can read or edit depending on role.
- Forking clones data into the requester’s ownership with fresh FSRS state.

## LLM and RAG pipeline
1. Chunk notes in background (Edge Function) and store in note_chunks.
2. Generate embeddings via model-specific embedding endpoint.
3. Store vectors in pgvector and index by ivfflat.
4. For queries, retrieve top-k chunks, assemble context, and stream response.
5. Use Vercel Edge for streaming; avoid long synchronous tasks on Vercel.

## Forking strategy
- Forking is executed inside Postgres via RPC functions.
- Each fork inserts new rows with forked_from_id for lineage.
- Bulk cloning avoids API timeouts and reduces lock contention.

## Vector cleanup
- Triggers delete note_chunks on note content updates.
- Embeddings are re-generated asynchronously after edits.

## FSRS scheduling
- FSRS state is stored per user and card.
- A daily cache table supports fast dashboard rendering.
- Edge Functions refresh caches on schedule or on-demand.

## Security and access control
- RLS on all tables with owner and collaborator checks.
- Public read for public entities, private otherwise.
- API key storage encrypted with application secret in Edge Functions.

## Billing and ads
- Stripe webhooks update billing_customers and subscriptions in Supabase.
- UI suppresses ads when is_paid_user = true.
- Paid users can opt into private or collaborator-only visibility.
- Forks created by free users default to public visibility.

## Issues.md mitigations mapped
- Vercel timeout: streaming responses, background functions for heavy work.
- Editor SSR issues: CodeMirror dynamic import and client boundary.
- Forking cascade: RPC-based set operations in Postgres.
- Vector cleanup and FSRS aggregates: triggers and cache tables.
