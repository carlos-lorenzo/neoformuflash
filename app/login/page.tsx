import Link from "next/link";

import { signInWithGoogle } from "@/server/actions/auth";

type LoginPageProps = {
  searchParams?: { error?: string };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const errorMessage =
    searchParams?.error === "auth"
      ? "We couldn't sign you in. Please try again."
      : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8f5f2,transparent_45%),linear-gradient(180deg,#ffffff,#f0ece7)] text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-24">
        <div className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Formuflash
          </span>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Welcome back to focused, AI-assisted studying.
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600">
            Log in to capture notes, generate flashcards, and practice exams with
            context-aware AI.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {errorMessage ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-zinc-800 sm:w-auto"
            >
              Continue with Google
            </button>
          </form>
        </div>

        <p className="text-xs text-zinc-500">
          By continuing you agree to our terms and privacy policy. Read more in
          the <Link href="/">homepage</Link>.
        </p>
      </main>
    </div>
  );
}
