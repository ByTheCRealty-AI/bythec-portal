"use client";

// Receipt affordance for a payment row. Read-only: opens the receipt image (or
// PDF) in a new tab. Two sources, handled transparently:
//   1. Legacy Bubble-imported receipts — file_url is a FULL external URL
//      (starts with "http"). We link straight to it.
//   2. Future storage-hosted files — file_url is a Supabase storage object path
//      in the private `documents` bucket. We mint a short-lived signed URL on
//      click (browser client → Storage RLS applies), same pattern as DocumentRow.
// If a payment has no attachment, the parent renders a muted dash instead of
// this component — keeps the table clean.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Receipt, Loader2 } from "lucide-react";
import type { PaymentAttachment } from "@/lib/types";

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function PaymentReceipt({ attachment }: { attachment: PaymentAttachment }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const external = isHttp(attachment.file_url);

  async function openStored() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: sErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(attachment.file_url, 60);
      if (sErr || !data?.signedUrl) {
        setError(sErr?.message ?? "Could not open the receipt.");
        setBusy(false);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the receipt.");
    } finally {
      setBusy(false);
    }
  }

  const label = (
    <span className="inline-flex items-center gap-1.5">
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Receipt className="h-3.5 w-3.5" />
      )}
      Receipt
    </span>
  );

  const cls =
    "inline-flex items-center rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1 text-xs font-semibold text-primary transition-all duration-200 hover:border-primary/45 hover:bg-primary/[0.10] disabled:opacity-60";

  // External URL: a plain link, no JS round-trip needed.
  if (external) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <a
          href={attachment.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          title={attachment.file_name ?? "View receipt"}
        >
          {label}
        </a>
      </span>
    );
  }

  // Storage path: sign on click.
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={openStored}
        disabled={busy}
        className={cls}
        title={attachment.file_name ?? "View receipt"}
      >
        {label}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
