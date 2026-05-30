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

export async function createCourse(formData: FormData) {
  const institutionId = coerceString(formData.get("institutionId"));
  const institutionSlug = coerceString(formData.get("institutionSlug"));
  const name = coerceString(formData.get("name"));
  const description = coerceString(formData.get("description"));

  if (!institutionId || !institutionSlug) {
    throw new Error("Institution is required.");
  }

  if (!name) {
    throw new Error("Course name is required.");
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session?.user) {
    throw new Error("You must be signed in to create a course.");
  }

  const userId = sessionData.session.user.id;

  const baseSlug = slugify(name) || "course";
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const { data: existing, error } = await supabase
      .from("courses")
      .select("id")
      .eq("institution_id", institutionId)
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
    .from("courses")
    .insert({
      institution_id: institutionId,
      owner_id: userId,
      name,
      slug,
      description: description || null,
    })
    .select("slug")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/${institutionSlug}`);
  redirect(`/${institutionSlug}/${data.slug}`);
}
