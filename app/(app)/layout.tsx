import Link from "next/link";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/get-user";
import { signOut } from "@/server/actions/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <header className="border-b border-zinc-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.2em]">
            Formuflash
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
