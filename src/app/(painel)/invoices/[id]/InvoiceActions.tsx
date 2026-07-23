"use client";

// Action bar do detalhe do invoice: Back (sessionStorage), Edit, Mark paid/unpaid,
// Print/Save as PDF, Archive. Tudo escondido na impressão (.print-hide).
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { setPaid, setCleanerPaid, archiveInvoice, unarchiveInvoice } from "../actions";
import { ArrowLeft, Pencil, Printer, Archive, ArchiveRestore, Check, RotateCcw, Sparkles } from "lucide-react";

export function InvoiceBackButton() {
  const router = useRouter();
  function goBack() {
    let target = "/invoices";
    try {
      const saved = sessionStorage.getItem("bythec:invoices-return");
      if (saved && saved.startsWith("/invoices")) target = saved;
    } catch {
      /* noop */
    }
    router.push(target);
  }
  return (
    <button
      type="button"
      onClick={goBack}
      className="print-hide mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" /> Back to invoices
    </button>
  );
}

export function InvoiceActions({
  id,
  paid,
  archived,
  showCleaner = false,
  cleanerPaid = false,
}: {
  id: string;
  paid: boolean;
  archived: boolean;
  // Só aparece em seasonal com cleaning_goes_to = 'bythec' (a By the C paga o cleaner).
  showCleaner?: boolean;
  cleanerPaid?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="print-hide flex flex-wrap items-center gap-3">
      <button
        onClick={() => start(() => setPaid(id, !paid))}
        disabled={pending}
        className={buttonClass(paid ? "ghost" : "primary")}
      >
        {paid ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {pending ? "Saving…" : paid ? "Mark as unpaid" : "Mark as paid"}
      </button>

      {showCleaner && (
        <button
          onClick={() => start(() => setCleanerPaid(id, !cleanerPaid))}
          disabled={pending}
          className={buttonClass(cleanerPaid ? "ghost" : "primary")}
        >
          {cleanerPaid ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {pending ? "Saving…" : cleanerPaid ? "Mark cleaner as unpaid" : "Mark cleaner as paid"}
        </button>
      )}

      {/* Print / Save as PDF = o PDF COMBINADO (invoice + recibos), mesmo destino
          do botão "Download invoice + receipts" da seção de documentos. Substitui
          o antigo window.print() (que saía só a folha do invoice, sem recibos). */}
      <a href={`/invoices/${id}/combined-pdf`} className={buttonClass("ghost")}>
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </a>

      <Link href={`/invoices/${id}/editar`} className={buttonClass("ghost")}>
        <Pencil className="h-4 w-4" /> Edit
      </Link>

      {archived ? (
        <button onClick={() => start(() => unarchiveInvoice(id))} disabled={pending} className={buttonClass("ghost")}>
          <ArchiveRestore className="h-4 w-4" /> Restore
        </button>
      ) : (
        <button
          onClick={() => {
            if (confirm("Archive this invoice? The history is preserved (we never delete).")) {
              start(() => archiveInvoice(id));
            }
          }}
          disabled={pending}
          className={buttonClass("danger")}
        >
          <Archive className="h-4 w-4" /> Archive
        </button>
      )}
    </div>
  );
}
