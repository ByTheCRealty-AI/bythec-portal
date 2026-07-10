import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can, canDelete, type AppRole } from "@/lib/auth/capabilities";
import { computeEscalation } from "@/lib/reminders";
import type { ReminderStatus, ReminderParentType } from "@/lib/types";
import { RemindersClient, type ReminderBoardRow, type PersonOption } from "./RemindersClient";
import {
  createReminderAction,
  updateReminderAction,
  setReminderStatusAction,
  archiveReminderAction,
  deleteReminderAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Linha crua do banco (sem joins de profile — RLS de profiles bloqueia os joins
// pra quem não gere usuários; os nomes/papéis vêm do diretório reminder_people).
type RawReminder = {
  id: string;
  title: string;
  notes: string | null;
  status: ReminderStatus;
  done_at: string | null;
  due_date: string | null;
  parent_type: ReminderParentType | null;
  parent_id: string | null;
  assigned_to: string;
  created_by: string;
  created_at: string;
};

async function loadReminders() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("reminders")
      .select(
        "id, title, notes, status, done_at, due_date, parent_type, parent_id, assigned_to, created_by, created_at"
      )
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { ok: true as const, reminders: (data ?? []) as RawReminder[] };
  } catch {
    return { ok: false as const, reminders: [] as RawReminder[] };
  }
}

// Diretório mínimo (id, nome, papel) das pessoas ativas — via SECURITY DEFINER
// gated por reminders.view. Usado pro dropdown E pra resolver nomes/papéis.
async function loadPeople(): Promise<PersonOption[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("reminder_people");
    if (error) throw error;
    return (data ?? []) as PersonOption[];
  } catch {
    return [];
  }
}

export default async function RemindersPage() {
  const profile = await getProfile();
  if (!can(profile, "reminders.view")) {
    return (
      <>
        <PageHeader title="Reminders" />
        <NoAccess />
      </>
    );
  }

  const [{ ok, reminders }, people] = await Promise.all([loadReminders(), loadPeople()]);

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const now = new Date();

  const rows: ReminderBoardRow[] = reminders.map((r) => {
    const assignee = peopleById.get(r.assigned_to) ?? null;
    const esc = computeEscalation(
      {
        status: r.status,
        created_at: r.created_at,
        due_date: r.due_date,
        assignee_role: assignee?.role ?? null,
      },
      now
    );
    return {
      id: r.id,
      title: r.title,
      notes: r.notes,
      status: r.status,
      done_at: r.done_at,
      due_date: r.due_date,
      parent_type: r.parent_type,
      parent_id: r.parent_id,
      assigned_to: r.assigned_to,
      assignee_name: assignee?.full_name ?? null,
      created_at: r.created_at,
      creator_name: peopleById.get(r.created_by)?.full_name ?? null,
      ageDays: esc.ageDays,
      escalatedToManager: esc.escalatedToManager,
      escalatedToOwner: esc.escalatedToOwner,
    };
  });

  const viewerRole = profile!.role as AppRole;
  const canManage = can(profile, "reminders.manage");

  return (
    <>
      <PageHeader title="Reminders" />

      {!ok && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Database not connected. Check the environment variables{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-primary">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </Card>
      )}

      <RemindersClient
        rows={rows}
        people={people}
        viewerRole={viewerRole}
        viewerId={profile!.id}
        canManage={canManage}
        isOwner={canDelete(profile)}
        createAction={createReminderAction}
        updateAction={updateReminderAction}
        setStatusAction={setReminderStatusAction}
        archiveAction={archiveReminderAction}
        deleteAction={deleteReminderAction}
      />
    </>
  );
}
