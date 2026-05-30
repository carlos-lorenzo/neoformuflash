import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff,transparent_50%),linear-gradient(180deg,#f8f5f2,#efe8df)] text-zinc-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-24">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Formuflash
          </span>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Study notes, flashcards, and exams in one focused workspace.
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600">
            Build structured courses, generate practice material with AI, and
            stay on top of reviews with smart scheduling.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-zinc-800"
          >
            Sign in
          </Link>
          <a
            href="/docs"
            className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-200 bg-white/70 px-6 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-700 transition hover:border-zinc-300"
          >
            Explore docs
          </a>
        </div>
      </main>
    </div>
  );
}
