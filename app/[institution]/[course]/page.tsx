import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createTopic } from "@/server/actions/topics";

type CoursePageProps = {
  params: { institution: string; course: string };
};

export default async function CoursePage({ params }: CoursePageProps) {
  const supabase = await createClient();
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
    .select("id, name, description, slug")
    .eq("institution_id", institution.id)
    .eq("slug", params.course)
    .maybeSingle();

  if (!course) {
    notFound();
  }

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name, description, slug, created_at")
    .eq("course_id", course.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff,transparent_50%),linear-gradient(180deg,#f8f5f2,#efe8df)] text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-24">
        <div className="flex items-center justify-between">
          <Link
            href={`/${institution.slug}`}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
          >
            {institution.name}
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
            {course.name}
          </h1>
          {course.description ? (
            <p className="text-lg text-zinc-600">{course.description}</p>
          ) : null}
          <p className="text-sm text-zinc-500">/{course.slug}</p>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6">
          <h2 className="text-lg font-semibold">Add a topic</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Topics keep notes, decks, and exams grouped together.
          </p>
          <form action={createTopic} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="institutionSlug" value={institution.slug} />
            <input type="hidden" name="courseId" value={course.id} />
            <input type="hidden" name="courseSlug" value={course.slug} />
            <label className="text-sm font-medium text-zinc-700">
              Topic name
              <input
                name="name"
                required
                placeholder="e.g. Limits and continuity"
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
              Create topic
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          {topics && topics.length > 0 ? (
            topics.map((topic) => (
              <Link
                key={topic.id}
                href={`/${institution.slug}/${course.slug}/${topic.slug}`}
                className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white/80 p-6 transition hover:border-zinc-300"
              >
                <h3 className="text-lg font-semibold text-zinc-900">
                  {topic.name}
                </h3>
                {topic.description ? (
                  <p className="text-sm text-zinc-600">{topic.description}</p>
                ) : null}
                <span className="text-xs text-zinc-400">/{topic.slug}</span>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-6 text-sm text-zinc-500">
              No topics yet. Create your first one above.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
