import { PageHeader, NoAccess, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth/session";
import { canDelete } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { RescueReceipts } from "./RescueReceipts";
import { rescueReceiptBatchAction, retryFailedReceiptsAction } from "./actions";

export const dynamic = "force-dynamic";

async function counts() {
  const supabase = createClient();
  const [remaining, failed, local] = await Promise.all([
    supabase.from("payment_attachments").select("id", { count: "exact", head: true })
      .like("file_url", "http%").is("migration_note", null),
    supabase.from("payment_attachments").select("id", { count: "exact", head: true })
      .not("migration_note", "is", null),
    supabase.from("payment_attachments").select("id", { count: "exact", head: true })
      .not("file_url", "like", "http%"),
  ]);
  return {
    remaining: remaining.count ?? 0,
    failed: failed.count ?? 0,
    local: local.count ?? 0,
  };
}

export default async function ReceiptRescuePage() {
  const profile = await getProfile();
  // Owner only: reescreve registro financeiro em massa.
  if (!canDelete(profile)) {
    return (
      <>
        <PageHeader title="Receipt files" />
        <NoAccess />
      </>
    );
  }

  const initial = await counts();

  return (
    <>
      <PageHeader
        title="Bring receipts over from Bubble"
        subtitle="Copy the receipt images off Bubble's servers and into your own storage."
      />

      <Card className="mb-6 text-sm text-ink/70">
        <p className="mb-2">
          Some of your receipts are not really stored in the portal — it only keeps a link pointing
          at Bubble. <strong className="text-ink">If Bubble is cancelled, those images are gone for
          good.</strong> The payment and the amount stay; the proof disappears.
        </p>
        <p className="mb-2">
          This copies each file into your own private storage and repoints the link. Payments are
          not touched: nothing is created, nothing is merged, no receipt moves to a different
          payment.
        </p>
        <p className="text-ink/55">
          It also closes a privacy gap. On Bubble these files sit on an open link that anyone can
          open. In your storage they are private to signed-in staff.
        </p>
      </Card>

      <RescueReceipts
        initial={initial}
        runBatch={rescueReceiptBatchAction}
        retryFailed={retryFailedReceiptsAction}
      />
    </>
  );
}
