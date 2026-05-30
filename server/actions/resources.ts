"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

type ResourceType = "note" | "deck" | "exam";

type Visibility = "public" | "private" | "collaborators";

function coerceString(value: FormDataEntryValue | null) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function asResourceType(value: string): ResourceType | null {
  if (value === "note" || value === "deck" || value === "exam") {
    return value;
  }

  return null;
}

function asVisibility(value: string): Visibility | null {
  if (value === "public" || value === "private" || value === "collaborators") {
    return value;
  }

  return null;
}

export async function createResource(formData: FormData) {
  const institutionSlug = coerceString(formData.get("institutionSlug"));
  const courseSlug = coerceString(formData.get("courseSlug"));
  const topicId = coerceString(formData.get("topicId"));
  const topicSlug = coerceString(formData.get("topicSlug"));
  const title = coerceString(formData.get("title"));
  const resourceType = asResourceType(coerceString(formData.get("resourceType")));
  const visibility = asVisibility(coerceString(formData.get("visibility"))) ?? "public";

  if (!institutionSlug || !courseSlug || !topicId || !topicSlug) {
    throw new Error("Topic is required.");
  }

  if (!title || !resourceType) {
    throw new Error("Resource title and type are required.");
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session?.user) {
    throw new Error("You must be signed in to create a resource.");
  }

  const userId = sessionData.session.user.id;

  const baseSlug = slugify(title) || "resource";
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const { data: existing, error } = await supabase
      .from("resources")
      .select("id")
      .eq("topic_id", topicId)
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!existing) {
      break;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const { data: resource, error } = await supabase
    .from("resources")
    .insert({
      topic_id: topicId,
      owner_id: userId,
      resource_type: resourceType,
      title,
      slug,
      visibility,
    })
    .select("id")
    .single();

  if (error || !resource) {
    throw new Error(error?.message ?? "Failed to create resource.");
  }

  let detailError: string | null = null;

  if (resourceType === "note") {
    const { error: noteError } = await supabase.from("notes").insert({
      id: resource.id,
      markdown: "",
    });
    detailError = noteError?.message ?? null;
  } else if (resourceType === "deck") {
    const { error: deckError } = await supabase.from("decks").insert({
      id: resource.id,
      description: null,
    });
    detailError = deckError?.message ?? null;
  } else if (resourceType === "exam") {
    const { error: examError } = await supabase.from("exams").insert({
      id: resource.id,
      format: "mixed",
      instructions: null,
      time_limit_minutes: null,
    });
    detailError = examError?.message ?? null;
  }

  if (detailError) {
    await supabase.from("resources").delete().eq("id", resource.id);
    throw new Error(detailError);
  }

  revalidatePath(`/${institutionSlug}/${courseSlug}/${topicSlug}`);
  redirect(`/${institutionSlug}/${courseSlug}/${topicSlug}/${resource.id}`);
}
