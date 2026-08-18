// Server Component: Open Graph / Twitter card meta tags for a public note.

import type { Metadata } from 'next';
import type { PublicNote } from '@neoformuflash/contracts';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://formuflash.com';

export function generateNoteMetadata(handle: string, note: PublicNote): Metadata {
  // Canonical is keyed on the author's handle, not the course slug — the note
  // is served from /@handle/note-slug and nowhere else.
  const noteUrl = `${SITE_URL}/@${handle}/${note.slug}`;
  const ogTitle = note.ogTitle ?? note.title;
  const ogDescription = note.ogDescription ?? note.contentText.slice(0, 255).trimEnd();
  const ogImage = note.ogImageUrl;

  return {
    title: ogTitle,
    description: ogDescription,
    openGraph: {
      type: 'article',
      url: noteUrl,
      title: ogTitle,
      description: ogDescription,
      siteName: 'FormuFlash',
      locale: note.language,
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description: ogDescription,
      ...(ogImage && { images: [ogImage] }),
    },
    other: {
      'article:published_time': note.publishedAt ?? '',
    },
    alternates: {
      canonical: noteUrl,
    },
  };
}