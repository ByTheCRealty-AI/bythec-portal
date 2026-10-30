"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/capabilities";

const BUCKET = "team-photos";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

async function assertCanManage() {
  const profile = await getProfile();
  // Team editing is owner + manager only (same as Users & Access).
  if (!canManageUsers(profile)) {
    throw new Error("You do not have permission to manage the team.");
  }
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export async function createTeamMemberAction(fd: FormData) {
  await assertCanManage();
  const name = str(fd, "name");
  const title = str(fd, "title");
  if (!name || !title) throw new Error("A new team member needs a name and a title.");

  const supabase = createClient();
  const { data: last } = await supabase
    .from("team_members")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("team_members").insert({
    name,
    title,
    bio: str(fd, "bio"),
    initials: initialsFrom(name),
    sort_order: nextOrder,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function updateTeamMemberAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing team member.");
  const name = str(fd, "name");
  const title = str(fd, "title");
  if (!name || !title) throw new Error("Name and title are required.");

  const supabase = createClient();
  const { error } = await supabase
    .from("team_members")
    .update({ name, title, bio: str(fd, "bio"), initials: initialsFrom(name), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Grava a foto nova. Se havia uma anterior, remove o arquivo antigo do bucket.
export async function setTeamPhotoAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  const photoUrl = str(fd, "photo_url");
  const storagePath = str(fd, "storage_path");
  if (!id || !photoUrl || !storagePath) throw new Error("Missing photo details.");

  const supabase = createClient();
  const { data: prev } = await supabase
    .from("team_members")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("team_members")
    .update({ photo_url: photoUrl, storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const old = prev?.storage_path as string | null | undefined;
  if (old && old !== storagePath) {
    await supabase.storage.from(BUCKET).remove([old]); // best-effort cleanup
  }
  revalidatePath("/users");
}

export async function removeTeamPhotoAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing team member.");

  const supabase = createClient();
  const { data: row } = await supabase.from("team_members").select("storage_path").eq("id", id).maybeSingle();
  const path = row?.storage_path as string | null | undefined;
  if (path) await supabase.storage.from(BUCKET).remove([path]);

  const { error } = await supabase
    .from("team_members")
    .update({ photo_url: null, storage_path: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function deleteTeamMemberAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing team member.");

  const supabase = createClient();
  const { data: row } = await supabase.from("team_members").select("storage_path").eq("id", id).maybeSingle();
  const path = row?.storage_path as string | null | undefined;
  if (path) await supabase.storage.from(BUCKET).remove([path]);

  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function reorderTeamMembersAction(fd: FormData) {
  await assertCanManage();
  const raw = str(fd, "order");
  if (!raw) throw new Error("Missing order.");
  const ids = raw.split(",").map((x) => x.trim()).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from("team_members").update({ sort_order: i }).eq("id", ids[i]);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/users");
}

export async function toggleTeamPublishedAction(fd: FormData) {
  await assertCanManage();
  const id = str(fd, "id");
  const published = str(fd, "published") === "true";
  if (!id) throw new Error("Missing team member.");
  const supabase = createClient();
  const { error } = await supabase
    .from("team_members")
    .update({ published, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}
