import Link from "next/link";

import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { createInstitution } from "@/server/actions/institutions";

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) {
    return null;
  }

  const supabase = createClient();
  const { data: institutions } = await supabase
    .from("institutions")
    .select("id, name, slug, description, visibility, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6">
        <h1 className="text-xl font-semibold">Your institutions</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Create a new institution to organize courses and topics.
        </p>
        <form action={createInstitution} className="mt-6 flex flex-col gap-4">
          <label className="text-sm font-medium text-zinc-700">
            Institution name
            <input
              name="name"
              required
              placeholder="e.g. Cambridge A-Level"
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Description
            <textarea
              name="description"
              rows={3}
              placeholder="Add a short description (optional)."
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 w-fit items-center justify-center rounded-full bg-zinc-900 px-6 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-zinc-800"
          >
            Create institution
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        {institutions && institutions.length > 0 ? (
          institutions.map((institution) => (
            <Link
              key={institution.id}
              href={`/${institution.slug}`}
              className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white/80 p-6 transition hover:border-zinc-300"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {institution.name}
                </h2>
                <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {institution.visibility}
                </span>
              </div>
              {institution.description ? (
                <p className="text-sm text-zinc-600">
                  {institution.description}
                </p>
              ) : null}
              <span className="text-xs text-zinc-400">/{institution.slug}</span>
            </Link>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-6 text-sm text-zinc-500">
            No institutions yet. Create your first one above.
          </div>
        )}
      </section>
    </div>
  );
}
