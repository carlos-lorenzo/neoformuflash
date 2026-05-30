import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type TopicPageProps = {
  params: { institution: string; course: string; topic: string };
};

export default async function TopicPage({ params }: TopicPageProps) {
  const supabase = createClient();
  const { data: institution } = await supabase
    .from("institutions")
    .select("id, name, slug")
    .eq("slug", params.institution)
    .maybeSingle();

  if (!institution) {
    notFound();
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, name, slug")
    .eq("institution_id", institution.id)
    .eq("slug", params.course)
    .maybeSingle();

  if (!course) {
    notFound();
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("id, name, description, slug")
    .eq("course_id", course.id)
    .eq("slug", params.topic)
    .maybeSingle();

  if (!topic) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff,transparent_50%),linear-gradient(180deg,#f8f5f2,#efe8df)] text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-24">
        <div className="flex items-center justify-between">
          <Link
            href={`/${institution.slug}/${course.slug}`}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
          >
            {course.name}
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
            {topic.name}
          </h1>
          {topic.description ? (
            <p className="text-lg text-zinc-600">{topic.description}</p>
          ) : null}
          <p className="text-sm text-zinc-500">/{topic.slug}</p>
        </div>

        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-6 text-sm text-zinc-500">
          Notes, decks, and exams will appear here once they are added.
        </div>
      </main>
    </div>
  );
}
