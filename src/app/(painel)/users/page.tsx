import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import {
  canManageUsers,
  can,
  type ProfileLike,
} from "@/lib/auth/capabilities";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { UsersManager } from "./UsersManager";

export const dynamic = "force-dynamic";

async function loadUsers() {
  try {
    const supabase = createClient();
    // RLS decide quem o usuário enxerga (a si + quem pode gerir).
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, address, role, permissions, active")
      .order("full_name", { ascending: true });
    if (error) throw error;
    return { ok: true as const, users: (data ?? []) as ProfileLike[] };
  } catch {
    return { ok: false as const, users: [] as ProfileLike[] };
  }
}

export default async function UsersPage() {
  const profile = await requireProfile();

  if (!canManageUsers(profile)) {
    return (
      <>
        <PageHeader title="Users & Access" />
        <NoAccess />
      </>
    );
  }

  const { ok, users } = await loadUsers();

  return (
    <>
      <PageHeader
        title="Users & Access"
        subtitle="Manage who can sign in and what each person can do."
      />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Could not load users. Check the database connection and that the auth
          migration has been applied.
        </Card>
      )}

      <UsersManager
        users={users}
        actor={{
          id: profile.id,
          role: profile.role,
          permissions: profile.permissions,
          active: profile.active,
        }}
        canCreate={can(profile, "users.create")}
        canDelete={can(profile, "users.delete")}
        canManageAccess={can(profile, "users.manage_access")}
        actorIsOwner={profile.role === "owner"}
      />
    </>
  );
}
