import { createClient } from "@/lib/supabase/server";
import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/capabilities";
import type { Expense } from "@/lib/types";
import { ExpensesClient } from "./ExpensesClient";
import {
  createExpenseAction,
  updateExpenseAction,
  deleteExpenseAction,
  setExpensePaidAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const profile = await getProfile();
  // Expenses = owner + manager + secretária (cap expenses.manage). RLS reforça no banco.
  if (!can(profile, "expenses.manage")) {
    return (
      <>
        <PageHeader title="Expenses" />
        <NoAccess />
      </>
    );
  }

  const supabase = createClient();
  const [{ data: expData, error }, { data: propData }, { data: cliData }] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id, description, price, date, due_date, paid, paid_by, category, vendor, property_id, client_id, archived_at, created_at"
      )
      .is("archived_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("properties")
      .select("id, address, address2")
      .is("archived_at", null)
      .order("address", { ascending: true }),
    supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name", { ascending: true }),
  ]);

  const expenses = (expData ?? []) as Expense[];
  const properties = (propData ?? []) as { id: string; address: string; address2: string | null }[];
  const clients = (cliData ?? []) as { id: string; name: string }[];

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Track business and property costs — what was spent, on what, and whether it's paid."
      />
      {error && (
        <Card className="mb-6 border-secondary/30 bg-secondary/[0.06] text-sm text-ink/70">
          Could not load expenses. Please try again.
        </Card>
      )}
      <ExpensesClient
        expenses={expenses}
        canManage={can(profile, "expenses.manage")}
        properties={properties}
        clients={clients}
        createAction={createExpenseAction}
        updateAction={updateExpenseAction}
        deleteAction={deleteExpenseAction}
        setPaidAction={setExpensePaidAction}
      />
    </>
  );
}
