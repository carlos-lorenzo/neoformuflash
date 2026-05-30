# Formuflash Requirements and Constraints

## Scope
- Build a NotebookLM-style study platform with Markdown/LaTeX notes, spaced repetition, and AI-generated quizzes.
- Support a 4-tier hierarchy: institution, course, topic, resource.
- Make public content discoverable with SEO-friendly URLs.

## Functional requirements
- Notes: Markdown + inline/block LaTeX; mhchem support; code highlighting.
- Flashcards: Decks with FSRS scheduling per user.
- Exams: MCQ and long-form questions with structured prompts.
- Forking: Clone public content into a user workspace with fresh FSRS state.
- Collaboration: Allow read or edit access via collaborator roles.
- Storage: Supabase buckets for images referenced in Markdown.

## Platform constraints
- Vercel free-tier timeouts require streaming and offloading heavy tasks.
- RSC and SSR must avoid editor incompatibilities.
- Supabase free tier limits require efficient queries and caching.

## Billing and ads
- Stripe integration must exist for paid subscriptions.
- Paid users see no ads and can make content non-public.
- Free users are public-by-default and ad-supported.

## AI and RAG constraints
- Dual API strategy: user-provided key or built-in Gemini tier.
- RAG pipeline uses pgvector with chunking and embeddings.
- AI responses must be streamed for long inference.
- Background chunking and embedding happen in Supabase Edge Functions.

## Access model
- Visibility levels: public, private, collaborators.
- RLS policies enforce read/write access by owner or collaborators.
- Public profiles are visible by default.
- Paid users can select visibility and collaborators for sharing.
- Free-user forks default to public visibility.

## Issue-to-mitigation mapping
| Issue | Risk | Mitigation |
| --- | --- | --- |
| Vercel 10s timeout | RAG pipeline exceeds limit | Stream responses and offload chunking/embedding to Supabase Edge Functions |
| Editor SSR | Monaco breaks RSC builds | Use CodeMirror 6 with dynamic import and client boundary |
| Forking cascade | API timeouts and DB locks | Use Postgres RPC to clone data set-based |
| Vector cleanup | Orphaned embeddings | Trigger deletes on note edits; re-embed asynchronously |
| FSRS aggregates | Slow dashboards over time | Cached daily review queues with indexed lookups |

## Assumptions
- Gemini embeddings are the default; vector dimension can be updated if provider changes.
- Resource pages are addressed by UUID, while hierarchy uses slugs.
- Forked content defaults to private visibility.

## Out of scope (initial blueprint)
- Payments, premium tiers, and monetization logic.
- Full-text search across all content beyond pgvector chunk search.
- Real-time collaboration with conflict resolution.
