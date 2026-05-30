import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type InstitutionPageProps = {
  params: { institution: string };
};

export default async function InstitutionPage({
  params,
}: InstitutionPageProps) {
  const supabase = createClient();
  const { data: institution } = await supabase
    .from("institutions")
    .select("id, name, description, slug")
    .eq("slug", params.institution)
    .maybeSingle();

  if (!institution) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff,transparent_50%),linear-gradient(180deg,#f8f5f2,#efe8df)] text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-24">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
          >
            Formuflash
          </Link>
          <Link
            href="/login"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600"
          >
            Sign in
          </Link>
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">
            {institution.name}
          </h1>
          {institution.description ? (
            <p className="text-lg text-zinc-600">{institution.description}</p>
          ) : null}
          <p className="text-sm text-zinc-500">/{institution.slug}</p>
        </div>

        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-6 text-sm text-zinc-500">
          Courses and topics will appear here once they are added.
        </div>
      </main>
    </div>
  );
}
