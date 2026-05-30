You are a Senior Fullstack Software Architect and Principal Engineer specializing in high-performance web applications, SEO optimization, and Serverless architectures. 

Your task is to create an exhaustive, production-grade implementation blueprint and technical design document for "Formuflash"—a next-generation, open-source AI-powered study platform. The platform combines advanced Markdown/LaTeX note-taking, spaced repetition flashcards, and a NotebookLM-like localized AI testing/generation engine.

### 🚀 Tech Stack Constraints (Free-Tier Optimized)
- Frontend & Backend Framework: Next.js (App Router) maximizing React Server Components (RSC) for aggressive SEO and React TS.
- Hosting: Vercel (Free Tier).
- Database & Backend-as-a-Service: Supabase (Free Tier PostgreSQL, Auth via Google OAuth, Storage for markdown images).
- Vector Database: Supabase `pgvector` extension for localized AI context embeddings.
- State Management & Caching: TanStack Query (React Query) to eliminate redundant network requests and cache data locally.
- Spaced Repetition: FSRS (Free Spaced Repetition Scheduler) algorithm library implemented on the edge.
- Editor Component: CodeMirror 6 or Monaco Editor (for VS Code-like autocomplete, snippets, and rich markdown/LaTeX handling).

---

### 🗂️ Data Hierarchy & Database Schema Requirements
The database must strictly support a 4-tier public/sharable structural hierarchy:
1. Institution/Exam System Level: (e.g., University Name, A-Levels, SAT, Edexcel).
2. Course Level: (e.g., Calculus I, Physics I). Must allow course-wide resources (studying all sub-content at once, generating global course exams/quizzes).
3. Topic Level: Specific sub-units within a course.
4. Resource Instance Level: The actual end-assets containing:
   - Flashcard Decks (with FSRS scheduling metrics: interval, stability, difficulty, retrievability).
   - Notes (Rich Markdown + LaTeX + Extensions).
   - Exams/Tests (Multiple choice and long-form open questions).

Every entity must support a "Forking" mechanism: a user can clone another user's public Course, Topic, or Resource into their personal workspace, duplicating the core content while initializing their own unique FSRS tracking metrics.

---

### ⚡ Detailed Feature Specifications

1. Markdown & Advanced Syntax Engine:
   - Must parse standard Markdown, inline/block LaTeX ($...$ and $$...$$).
   - Extended syntax extensions: `mhchem` for rendering chemistry structures, markdown-it/rehype-heavy support for rich interactive tables, and code syntax highlighting.
   - Images: Stored in Supabase Buckets, references injected as standard markdown asset URLs.

2. NotebookLM-Style LLM Integration:
   - Dual-API Strategy: Users can provide their own LLM API Key (OpenAI/Gemini/OpenRouter) via settings, or use a fallback built-in tier (e.g., Gemini Free Tier API key).
   - Contextual RAG: When viewing a specific Topic or Course, use `pgvector` to chunk and embed the notes/documents. The LLM must be capable of:
     - Automatically generating flashcard decks from notes.
     - Structuring practice exams (Multiple choice + Long-form questions) modeled after the architectural pattern of past exam papers provided by the user.

3. Adsense Readiness & UI Layout:
   - Modern, responsive, clean UX/UI using Tailwind CSS and shadcn/ui.
   - The layout architecture must cleanly allocate non-intrusive container slots compliant with Google AdSense placeholders (e.g., sidebar rails, inline feed placements) without breaking the responsive grid system.

4. Public and Social Discovery Engine:
   - Public Profiles: Every user account is public by default (`formuflash.com/user/[username]`).
   - Deep Linking: Every course and deck has deterministic, clean URLs optimized for search crawler indexing (`formuflash.com/[institution]/[course]/[topic]/[resource-id]`).

---

### 🛠️ Expected Output Deliverables
Please process all the specifications above and generate:
1. A Complete Entity-Relationship Diagram (ERD) represented in PostgreSQL SQL DDL schema commands for Supabase, including Row-Level Security (RLS) rules for public viewing vs. owner editing.
2. The Folder Structure layout for a Next.js App Router project optimizing Server Actions and API Routes.
3. A client-side caching configuration using TanStack Query to ensure ultra-fast navigation without redundant backend fetches.
4. An architectural implementation strategy for the FSRS algorithm inside Next.js edge functions.
5. A phased, step-by-step development roadmap breaking the build down into 4 logical milestones.