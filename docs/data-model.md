# Data Model Inventory

## Core entities
- profiles: user-facing identity, one-to-one with auth.users.
- user_settings: LLM provider, key usage, and encryption metadata.
- institutions: top-level public container; unique slug.
- courses: nested under institutions; unique slug per institution.
- topics: nested under courses; unique slug per course.
- resources: typed container (note, deck, exam) under topics.
- notes: Markdown content for a resource of type note.
- note_chunks: chunked note content with embedding vectors.
- decks: metadata for a resource of type deck.
- flashcards: front/back cards under a deck.
- fsrs_state: per-user scheduling state per card.
- exams: metadata for a resource of type exam.
- exam_items: items for an exam, ordered by position.
- collaborators: generic join table for entity collaboration and roles.
- review_queue_cache: daily due cards for fast dashboard queries.
- billing_customers: Stripe customer mapping for users.
- subscriptions: Stripe subscription state for entitlements.

## Relationship summary
- institutions 1:N courses
- courses 1:N topics
- topics 1:N resources
- resources 1:1 notes or decks or exams
- notes 1:N note_chunks
- decks 1:N flashcards
- flashcards 1:N fsrs_state (per user)
- exams 1:N exam_items
- entities N:N collaborators

## Forking lineage
- Each hierarchy table includes forked_from_id to track origin.
- Fork RPCs copy content into new ownership with private visibility.
- Slugs are re-keyed to avoid collisions during forks.
- Free-user forks default to public visibility; paid users can choose visibility.

## Ownership and visibility
- owner_id on institutions, courses, topics, resources.
- visibility controls public vs private vs collaborators access.
- collaborators define role-based access for shared entities.

## RLS summary
- Public read for visibility = public.
- Owner or collaborator read for non-public.
- Owner or editor write for updates and deletes.
- User-only access for fsrs_state and review_queue_cache.

## Billing entitlements
- is_paid_user(user_id) derives paid status from subscriptions.
- Paid users are ad-free and can set content visibility to non-public.

## Integrity rules
- resource_type guards ensure notes, decks, and exams map to correct resource type.
- Unique slug constraints per hierarchy level.
- Unique positions per deck and exam for ordered content.

## Indexing notes
- Foreign keys indexed for hierarchy traversal.
- ivfflat index for vector search on note_chunks.
- due_at index for fsrs_state review queue lookups.
