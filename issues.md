1. The Vercel Free Tier 10-Second Timeout Limit

The Problem: Vercel’s free tier limits Serverless Functions to a 10-second execution timeout. Your NotebookLM-style RAG pipeline (Chunking $\rightarrow$ Embedding generation via pgvector $\rightarrow$ LLM Context Assembly $\rightarrow$ Inference) will easily exceed 10 seconds for large notes or course-wide exam generation.

The Mitigation: You must offload LLM orchestration to Next.js Edge Routes or stream responses using the ai SDK (streamText). For non-streamable background tasks (like chunking an entire textbook), you will need a decoupled background worker or utilize Supabase Edge Functions which offer separate execution limits.

2. Edge Compatibility of CodeMirror / Monaco

The Problem: Monaco Editor is notoriously heavy and relies heavily on browser APIs (document, window), meaning it cannot be pre-rendered on the server via React Server Components (RSC) without completely breaking the build.

The Mitigation: It must be dynamically imported with ssr: false. CodeMirror 6 is more modular and mobile-friendly than Monaco, making it the preferred choice for a highly responsive study app where students review cards on mobile browsers.

3. The "Forking" Cascade & Data Redundancy

The Problem: When a user forks an entire Institution or Course containing hundreds of topics and flashcards, executing deep iterative INSERT INTO ... SELECT statements over HTTP via an API route will cause timeouts and database locks.

The Mitigation: Forking operations must be handled entirely database-side via a specialized PostgreSQL Pl/pgSQL function executed through a single Supabase RPC call.

4. Missing Features Essential for Success

Vector Cleanup Triggers: When a note is updated or deleted, its corresponding embeddings in pgvector will become stale or orphaned. You need automated PostgreSQL triggers to purge or flag outdated vector chunks.

FSRS Materialized Aggregates: Calculating daily review queues dynamically by scanning raw FSRS parameters across thousands of cards will slow down your dashboard over time. You need a daily cached state or a highly indexed query strategy.

