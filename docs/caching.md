# TanStack Query Caching Strategy

## Query client defaults
- staleTime: 60s for most read queries.
- gcTime: 5-10 minutes based on memory profile.
- refetchOnWindowFocus: false for stable UX.
- retry: 1 for read queries, 0 for mutations.

## Query keys
- ["institution", slug]
- ["course", institutionSlug, courseSlug]
- ["topic", institutionSlug, courseSlug, topicSlug]
- ["resource", resourceId]
- ["deck", resourceId]
- ["exam", resourceId]
- ["notes", resourceId]
- ["search", scope, filters]
- ["reviewQueue", userId, date]

## Prefetch and hydration
- Use RSC to prefetch public pages and hydrate client cache.
- Hydrate per route to avoid caching unrelated data.

## Invalidation rules
- Resource updates: invalidate ["resource", resourceId], ["notes", resourceId].
- Flashcard edits: invalidate ["deck", resourceId], ["reviewQueue", userId, date].
- Forks: invalidate owner lists and discovery feeds.
- Topic/course edits: invalidate ancestor pages and search feeds.

## Pagination
- Use infinite queries for public discovery lists.
- Cache page cursors separately to avoid refetch storms.
