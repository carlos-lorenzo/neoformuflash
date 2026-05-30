import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createResource } from "@/server/actions/resources";

type TopicPageProps = {
  params: { institution: string; course: string; topic: string };
};

export default async function TopicPage({ params }: TopicPageProps) {
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

  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, resource_type, visibility, created_at")
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: false });

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

        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6">
          <h2 className="text-lg font-semibold">Add a resource</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Create a note, flashcard deck, or exam inside this topic.
          </p>
          <form action={createResource} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="institutionSlug" value={institution.slug} />
            <input type="hidden" name="courseSlug" value={course.slug} />
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="topicSlug" value={topic.slug} />
            <label className="text-sm font-medium text-zinc-700">
              Resource title
              <input
                name="title"
                required
                placeholder="e.g. Derivatives summary"
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Type
              <select
                name="resourceType"
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-zinc-400 focus:outline-none"
                defaultValue="note"
              >
                <option value="note">Note</option>
                <option value="deck">Deck</option>
                <option value="exam">Exam</option>
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Visibility
              <select
                name="visibility"
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-zinc-400 focus:outline-none"
                defaultValue="public"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="collaborators">Collaborators</option>
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex h-11 w-fit items-center justify-center rounded-full bg-zinc-900 px-6 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-zinc-800"
            >
              Create resource
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          {resources && resources.length > 0 ? (
            resources.map((resource) => (
              <Link
                key={resource.id}
                href={`/${institution.slug}/${course.slug}/${topic.slug}/${resource.id}`}
                className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white/80 p-6 transition hover:border-zinc-300"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-900">
                    {resource.title}
                  </h3>
                  <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {resource.resource_type}
                  </span>
                </div>
                <span className="text-xs text-zinc-400">{resource.visibility}</span>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-6 text-sm text-zinc-500">
              No resources yet. Create your first one above.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
