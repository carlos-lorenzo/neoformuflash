-- One-time migration: delete orphan decks and notes (course_id IS NULL).
-- Run once before deploying phase-03c. The app has no production data yet.
-- If production data exists, back up first.

DELETE FROM public.cards WHERE deck_id IN (SELECT id FROM public.decks WHERE course_id IS NULL);
DELETE FROM public.decks WHERE course_id IS NULL;
DELETE FROM public.notes WHERE course_id IS NULL;