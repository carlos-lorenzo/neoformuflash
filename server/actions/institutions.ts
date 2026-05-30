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

export async function createInstitution(formData: FormData) {
  const name = coerceString(formData.get("name"));
  const description = coerceString(formData.get("description"));

  if (!name) {
    throw new Error("Institution name is required.");
  }

  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("You must be signed in to create an institution.");
  }

  const baseSlug = slugify(name) || "institution";
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const { data: existing, error } = await supabase
      .from("institutions")
      .select("id")
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
    .from("institutions")
    .insert({
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

  revalidatePath("/dashboard");
  redirect(`/${data.slug}`);
}
