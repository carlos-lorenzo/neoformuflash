"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

function coerceString(value: FormDataEntryValue | null) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

export async function createTopic(formData: FormData) {
  const institutionSlug = coerceString(formData.get("institutionSlug"));
  const courseId = coerceString(formData.get("courseId"));
  const courseSlug = coerceString(formData.get("courseSlug"));
  const name = coerceString(formData.get("name"));
  const description = coerceString(formData.get("description"));

  if (!institutionSlug || !courseId || !courseSlug) {
    throw new Error("Course is required.");
  }

  if (!name) {
    throw new Error("Topic name is required.");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("You must be signed in to create a topic.");
  }

  const baseSlug = slugify(name) || "topic";
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const { data: existing, error } = await supabase
      .from("topics")
      .select("id")
      .eq("course_id", courseId)
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

  const { data, error } = await supabase
    .from("topics")
    .insert({
      course_id: courseId,
      owner_id: userData.user.id,
      name,
      slug,
      description: description || null,
    })
    .select("slug")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/${institutionSlug}/${courseSlug}`);
  redirect(`/${institutionSlug}/${courseSlug}/${data.slug}`);
}
