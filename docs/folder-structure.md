# Next.js App Router Folder Structure

```
app/
  (marketing)/
    page.tsx
    pricing/page.tsx
    features/page.tsx
  (app)/
    layout.tsx
    dashboard/page.tsx
    user/[username]/page.tsx
    settings/page.tsx
    [institution]/
      [course]/
        [topic]/
          [resourceId]/
            page.tsx
            edit/page.tsx
            deck/page.tsx
            exam/page.tsx
  api/
    llm/
      stream/route.ts      # Edge runtime, streaming
    embeddings/
      ingest/route.ts      # Proxy or webhook to Supabase Edge
    fork/
      [entityType]/[id]/route.ts
    review/
      queue/route.ts
components/
  editor/
  deck/
  exam/
  notes/
lib/
  auth/
  supabase/
  llm/
  rag/
  fsrs/
  cache/
server/
  actions/
  queries/
  mutations/
styles/
  globals.css
```

## Notes
- CodeMirror editor is a client component with dynamic import (ssr: false).
- Public routes rely on slugs for institution/course/topic and UUID for resource.
- Server Actions handle create/update for notes, decks, and exams.
- Edge routes are used for streaming LLM responses and for quick fetches.
