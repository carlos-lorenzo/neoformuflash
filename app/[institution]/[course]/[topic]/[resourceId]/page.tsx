import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type ResourcePageProps = {
  params: { institution: string; course: string; topic: string; resourceId: string };
};

export default async function ResourcePage({ params }: ResourcePageProps) {
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
    .select("id, name, slug")
    .eq("course_id", course.id)
    .eq("slug", params.topic)
    .maybeSingle();

  if (!topic) {
    notFound();
  }

  const { data: resource } = await supabase
    .from("resources")
    .select("id, title, resource_type, visibility")
    .eq("id", params.resourceId)
    .eq("topic_id", topic.id)
    .maybeSingle();

  if (!resource) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff,transparent_50%),linear-gradient(180deg,#f8f5f2,#efe8df)] text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-24">
        <div className="flex items-center justify-between">
          <Link
            href={`/${institution.slug}/${course.slug}/${topic.slug}`}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
          >
            {topic.name}
          </Link>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {resource.visibility}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">
            {resource.title}
          </h1>
          <p className="text-sm text-zinc-500">
            {resource.resource_type} resource
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-6 text-sm text-zinc-500">
          Resource content will render here once the editor and builders are wired.
        </div>
      </main>
    </div>
  );
}
