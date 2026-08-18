/*
 * Public-facing types for profiles, notes, and courses.
 * These are the shapes rendered on /@handle and /@handle/note-slug pages.
 * No auth, no private fields — only what anonymous visitors see.
 */

/**
 * Public profile — the minimal shape needed for the profile page.
 * Only columns granted to anon/authenticated in 0012_public_profiles.sql.
 * locale is a string (not an enum in the DB), validated at the app layer.
 */
export type PublicProfile = {
  id: string;
  slug: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
};

/**
 * Public course — shown in the profile's courses grid.
 * Subscriber/fork counts are public (they're just numbers, not user lists).
 * ownerId is included for ownership checks on public pages.
 */
export type PublicCourse = {
  id: string;
  slug: string;
  name: string;
  code: string | null;
  subscriberCount: number;
  forkCount: number;
  ownerId: string;
};

/**
 * Public deck — shown on the deck page and in course cards.
 */
export type PublicDeck = {
  id: string;
  slug: string;
  title: string;
  subscriberCount: number;
  forkCount: number;
  ownerId: string;
  course: {
    id: string;
    slug: string;
    name: string;
  } | null;
};

import type { NoteDoc } from './content';

/**
 * Public note — shown in the profile's notes list and on the note page.
 * Includes SEO metadata and the parent course (for breadcrumb).
 * contentJson is included for rendering the full note on the note page.
 */
export type PublicNote = {
  id: string;
  slug: string;
  title: string;
  contentText: string;
  contentJson: NoteDoc;
  language: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  publishedAt: string | null;
  course: {
    id: string;
    slug: string;
    name: string;
  } | null;
};

/**
 * SEO metadata input for the note editor (owner only).
 * All fields optional — any subset can be updated.
 */
export type UpdateNoteSeoInput = {
  noteId: string;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
};