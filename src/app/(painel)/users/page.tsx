import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import {
  canManageUsers,
  can,
  type ProfileLike,
} from "@/lib/auth/capabilities";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { UsersManager } from "./UsersManager";
import { TeamClient, type TeamMemberRow } from "../team/TeamClient";
import {
  createTeamMemberAction,
  updateTeamMemberAction,
  setTeamPhotoAction,
  removeTeamPhotoAction,
  deleteTeamMemberAction,
  reorderTeamMembersAction,
  toggleTeamPublishedAction,
} from "../team/actions";

export const dynamic = "force-dynamic";

async function loadUsers() {
  try {
    const supabase = createClient();
    // RLS decide quem o usuário enxerga (a si + quem pode gerir).
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, address, address_line1, address_line2, city, state, zip, role, permissions, active")
      .order("full_name", { ascending: true });
    if (error) throw error;
    return { ok: true as const, users: (data ?? []) as ProfileLike[] };
  } catch {
    return { ok: false as const, users: [] as ProfileLike[] };
  }
}

// "Meet the Team" members shown on the public website (team_members table).
// Managed here because this screen is already owner/manager only.
async function loadTeam(): Promise<TeamMemberRow[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_members")
      .select("id, name, title, bio, photo_url, storage_path, initials, sort_order, published")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as TeamMemberRow[];
  } catch {
    return [];
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
  const team = await loadTeam();

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

      {/* Meet the Team — public website people. Owner/manager only (this whole
          screen is gated by canManageUsers). */}
      <section className="mt-14 border-t border-black/[0.07] pt-10">
        <h2 className="h-display text-2xl text-ink">Meet the Team</h2>
        <p className="mb-6 mt-1 max-w-2xl text-sm text-ink/55">
          The people shown in the “Meet the Team” section of the public website. Upload a professional
          headshot, edit the name, title or bio, choose who is published, and drag to reorder.
        </p>
        <TeamClient
          members={team}
          createAction={createTeamMemberAction}
          updateAction={updateTeamMemberAction}
          setPhotoAction={setTeamPhotoAction}
          removePhotoAction={removeTeamPhotoAction}
          deleteAction={deleteTeamMemberAction}
          reorderAction={reorderTeamMembersAction}
          togglePublishedAction={toggleTeamPublishedAction}
        />
      </section>
    </>
  );
}
