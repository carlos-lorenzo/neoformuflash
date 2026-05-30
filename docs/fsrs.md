# FSRS Strategy

## Data model
- flashcards store immutable front/back content.
- fsrs_state stores per-user scheduling parameters.
- review_queue_cache stores daily due cards for fast dashboards.

## Scheduling flow
1. Client answers a card.
2. Edge route runs FSRS calculation and updates fsrs_state.
3. review_queue_cache is updated for the current date.

## Daily refresh
- An Edge Function runs a daily refresh per user.
- It calls refresh_review_queue_cache(user_id, date) for cache rebuilds.

## Initial state
- New cards insert a default fsrs_state row with due_at = now().
- FSRS edge logic adjusts stability/difficulty after first review.

## Rationale
- Avoid scanning raw FSRS params for every dashboard load.
- Keep queue fetch predictable with indexed lookups.
