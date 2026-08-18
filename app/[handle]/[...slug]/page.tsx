// Server Component: catch-all for /@handle/{note-slug} and /@handle/{deck-slug}.
// Disambiguates by querying both note and deck tables — the one that exists wins.

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { Route } from 'next';
import { getPublicNoteBySlug } from '@/lib/db/notes';
import { getPublicDeckBySlug, getPublicDeckBySlugPublic } from '@/lib/db/decks';
import { listCards } from '@/lib/db/cards';
import { parseHandleSegment } from '@/lib/public/handle';
import { getSessionUser } from '@/lib/supabase/session';
import { NoteDocView } from '@/components/note/note-doc-view';
import { generateNoteMetadata } from '@/components/public/public-note-meta';
import { UsersIcon, CodeForkIcon } from '@/components/ui/icon';
import { ShareActionsServer } from '@/components/share/share-actions-server';

async function resolveRoute(handle: string, slug: string) {
  // Try note first (more common for public sharing), then deck.
  const noteResult = await getPublicNoteBySlug(handle, slug);
  if (noteResult.ok && noteResult.value) {
    return { type: 'note', data: noteResult.value } as const;
  }

  const deckResult = await getPublicDeckBySlug(handle, slug);
  if (deckResult.ok && deckResult.value) {
    return { type: 'deck', data: deckResult.value } as const;
  }

  return null;
}

async function resolveRoutePublic(handle: string, slug: string) {
  // Try note first (more common for public sharing), then deck.
  const noteResult = await getPublicNoteBySlug(handle, slug);
  if (noteResult.ok && noteResult.value) {
    return { type: 'note', data: noteResult.value } as const;
  }

  const deckResult = await getPublicDeckBySlugPublic(handle, slug);
  if (deckResult.ok && deckResult.value) {
    return { type: 'deck', data: deckResult.value } as const;
  }

  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string[] }>;
}) {
  const { handle: segment, slug } = await params;
  const handle = parseHandleSegment(segment);
  if (!handle) return { title: 'Not found · FormuFlash' };

  const pathSlug = slug.join('/');
  const resolved = await resolveRoute(handle, pathSlug);

  if (!resolved) return { title: 'Not found · FormuFlash' };

  if (resolved.type === 'note') {
    return generateNoteMetadata(handle, resolved.data);
  }

  const deck = resolved.data;
  const t = await getTranslations('publicProfile');
  return {
    title: `${deck.title} · @${handle} · FormuFlash`,
    description: t('deck.metaDescription', { title: deck.title, handle: `@${handle}` }),
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://formuflash.com'}/@${handle}/${pathSlug}`,
    },
  };
}

export default async function PublicCatchAllPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string[] }>;
}) {
  const { handle: segment, slug } = await params;
  const handle = parseHandleSegment(segment);
  if (!handle) notFound();

  const pathSlug = slug.join('/');
  const tNote = await getTranslations('publicNote');
  const tProfile = await getTranslations('publicProfile');

  const resolved = await resolveRoutePublic(handle, pathSlug);
  if (!resolved) notFound();

  const tBreadcrumb = tProfile('breadcrumb');

  // NOTE PAGE
  if (resolved.type === 'note') {
    const note = resolved.data;
    const profileUrl = `/@${handle}` as Route;
    const courseUrl = note.course ? (`/@${handle}/courses/${note.course.slug}` as Route) : null;

    return (
      <div className="mx-auto w-full max-w-measure px-4 py-8">
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-ui-sm text-secondary" aria-label={tBreadcrumb}>
          <Link href={profileUrl} className="hover:text-primary">
            @{handle}
          </Link>
          {courseUrl && (
            <>
              <span aria-hidden="true">/</span>
              <Link href={courseUrl} className="hover:text-primary">
                {note.course!.name}
              </Link>
            </>
          )}
          <span aria-hidden="true">/</span>
          <span className="font-medium text-primary" aria-current="page">
            {note.title}
          </span>
        </nav>

        <article className="prose prose-neutral max-w-none">
          <header className="mb-6">
            <h1 className="text-read-h1 font-semibold text-primary">{note.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-ui-sm text-tertiary">
              <time dateTime={note.publishedAt ?? ''}>
                {note.publishedAt
                  ? new Date(note.publishedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : tNote('unpublished')}
              </time>
              <span className="uppercase">{note.language}</span>
            </div>
          </header>

          <div className="note-content">
            <NoteDocView doc={note.contentJson} />
          </div>

          <footer className="mt-8 border-t border-subtle pt-4">
            <Link
              href={profileUrl}
              className="inline-flex items-center gap-1 text-ui-sm text-secondary hover:text-primary"
            >
              {tNote('viewOnFormuFlash')}
            </Link>
          </footer>
        </article>
      </div>
    );
  }

  // DECK PAGE
  const deck = resolved.data;
  const cardsResult = await listCards(deck.id);
  const cards = cardsResult.ok ? cardsResult.value : [];

  // Get current user to determine ownership and subscription status
  const user = await getSessionUser();
  const isOwner = user?.id === deck.ownerId;

  const profileUrl = `/@${handle}` as Route;
  const courseUrl = deck.course ? (`/@${handle}/courses/${deck.course.slug}` as Route) : null;

  return (
    <div className="mx-auto w-full max-w-measure px-4 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-ui-sm text-secondary" aria-label={tBreadcrumb}>
        <Link href={profileUrl} className="hover:text-primary">
          @{handle}
        </Link>
        {courseUrl && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={courseUrl} className="hover:text-primary">
              {deck.course!.name}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <Link
          href={`/@${handle}/${pathSlug}`}
          className="hover:text-primary font-medium text-primary"
          aria-current="page"
        >
          {deck.title}
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-read-h1 font-semibold text-primary">{deck.title}</h1>
        <div className="mt-4 flex items-center gap-4 text-ui-xs tracking-ui text-tertiary">
          <span className="flex items-center gap-1" title={tProfile('detail.subscribers')}>
            <UsersIcon className="text-tertiary" /> {deck.subscriberCount}
          </span>
          <span className="flex items-center gap-1" title={tProfile('detail.forks')}>
            <CodeForkIcon className="text-tertiary" /> {deck.forkCount}
          </span>
        </div>
        {/* Share actions (subscribe/fork) */}
        <div className="mt-4">
          <ShareActionsServer deck={deck} isOwner={isOwner} />
        </div>
      </header>

      {cards.length === 0 ? (
        <p className="text-ui-base text-secondary">{tProfile('detail.emptyCards')}</p>
      ) : (
        <ol className="flex flex-col gap-6">
          {cards.map((card, i) => (
            <li key={card.id} className="rounded-lg border border-subtle bg-raised p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="text-ui-xs tracking-ui text-tertiary">
                  {tProfile('preview.card', { n: i + 1 })}
                </span>
              </div>
              <div className="flex flex-col gap-6">
                <section>
                  <h2 className="mb-2 text-ui-xs font-medium tracking-ui text-secondary uppercase">
                    {tProfile('cardEditor.front')}
                  </h2>
                  <NoteDocView doc={card.frontJson} />
                </section>
                <section>
                  <h2 className="mb-2 text-ui-xs font-medium tracking-ui text-secondary uppercase">
                    {tProfile('cardEditor.back')}
                  </h2>
                  <NoteDocView doc={card.backJson} />
                </section>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}