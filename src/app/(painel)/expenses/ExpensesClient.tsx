"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass, buttonClass, Badge, EmptyState } from "@/components/ui";
import { money, date } from "@/lib/format";
import {
  Plus, Pencil, Trash2, Loader2, X, Receipt, Check, Search,
  Upload, FileText, ExternalLink, Paperclip,
} from "lucide-react";
import {
  PAID_BY_LABEL,
  EXPENSE_CATEGORY_OPTIONS,
  type Expense,
  type ExpenseAttachment,
  type PaidBy,
} from "@/lib/types";

const MAX_RECEIPT_BYTES = 50 * 1024 * 1024; // 50 MB (Supabase free-plan cap)

function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  return cleaned || "file";
}

type AttachmentActions = {
  add: (fd: FormData) => Promise<ExpenseAttachment>;
  remove: (fd: FormData) => void | Promise<void>;
};

type PickProp = { id: string; address: string; address2: string | null };
type PickClient = { id: string; name: string };
type Filter = "all" | "unpaid" | "paid";

export function ExpensesClient({
  expenses,
  canManage,
  properties,
  clients,
  createAction,
  updateAction,
  deleteAction,
  setPaidAction,
  addAttachmentAction,
  deleteAttachmentAction,
}: {
  expenses: Expense[];
  canManage: boolean;
  properties: PickProp[];
  clients: PickClient[];
  createAction: (fd: FormData) => void | Promise<void>;
  updateAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  setPaidAction: (id: string, paid: boolean) => Promise<void>;
  addAttachmentAction: (fd: FormData) => Promise<ExpenseAttachment>;
  deleteAttachmentAction: (fd: FormData) => void | Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [creating, setCreating] = useState(false);

  const propLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of properties) m.set(p.id, p.address2 ? `${p.address} · ${p.address2}` : p.address);
    return m;
  }, [properties]);
  const clientLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filter === "unpaid" && e.paid) return false;
      if (filter === "paid" && !e.paid) return false;
      if (!needle) return true;
      return (
        (e.description ?? "").toLowerCase().includes(needle) ||
        (e.vendor ?? "").toLowerCase().includes(needle) ||
        (e.category ?? "").toLowerCase().includes(needle)
      );
    });
  }, [expenses, filter, q]);

  const totalSpent = expenses.reduce((n, e) => n + (Number(e.price) || 0), 0);
  const totalUnpaid = expenses.filter((e) => !e.paid).reduce((n, e) => n + (Number(e.price) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wider text-ink/45">Total expenses</p>
          <p className="mt-1 text-xl font-bold text-ink">{money(totalSpent)}</p>
        </div>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wider text-ink/45">Unpaid</p>
          <p className="mt-1 text-xl font-bold text-secondary">{money(totalUnpaid)}</p>
        </div>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wider text-ink/45">Entries</p>
          <p className="mt-1 text-xl font-bold text-ink">{expenses.length}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-black/[0.08] bg-white p-1">
          {(["all", "unpaid", "paid"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-lg px-3 py-1.5 text-sm capitalize transition " +
                (filter === f ? "bg-primary/10 font-semibold text-primary" : "text-ink/55 hover:text-ink")
              }
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className={inputClass + " !py-2 pl-9"}
            />
          </div>
          {canManage && (
            <button onClick={() => setCreating(true)} className={buttonClass("primary")}>
              <Plus className="h-4 w-4" /> Add expense
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No expenses"
          message={canManage ? "Add your first expense to start tracking costs." : "Expenses will appear here."}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3 font-bold">Date</th>
                <th className="px-4 py-3 font-bold">Description</th>
                <th className="px-4 py-3 font-bold">Category</th>
                <th className="px-4 py-3 font-bold">For</th>
                <th className="px-4 py-3 text-right font-bold">Amount</th>
                <th className="px-4 py-3 font-bold">Paid by</th>
                <th className="px-4 py-3 font-bold">Status</th>
                {canManage && <th className="px-4 py-3 text-right font-bold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.id} className={i % 2 === 1 ? "bg-black/[0.012]" : ""}>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{date(e.date)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{e.description}</span>
                    {e.vendor && <span className="block text-xs text-ink/45">{e.vendor}</span>}
                    {(e.attachments?.length ?? 0) > 0 && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink/45">
                        <Paperclip className="h-3 w-3" /> {e.attachments!.length}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{e.category ?? "—"}</td>
                  <td className="px-4 py-3 text-ink/60">
                    {e.property_id
                      ? propLabel.get(e.property_id) ?? "Property"
                      : e.client_id
                      ? clientLabel.get(e.client_id) ?? "Client"
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">
                    {money(e.price)}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{e.paid_by ? PAID_BY_LABEL[e.paid_by] : "—"}</td>
                  <td className="px-4 py-3">
                    <PaidToggle expense={e} canManage={canManage} setPaidAction={setPaidAction} />
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setEditing(e)}
                          aria-label="Edit expense"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.10] text-ink/55 hover:bg-black/[0.03]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <DeleteExpense expense={e} deleteAction={deleteAction} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ExpenseModal
          expense={editing}
          properties={properties}
          clients={clients}
          action={editing ? updateAction : createAction}
          attachmentActions={{ add: addAttachmentAction, remove: deleteAttachmentAction }}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PaidToggle({
  expense,
  canManage,
  setPaidAction,
}: {
  expense: Expense;
  canManage: boolean;
  setPaidAction: (id: string, paid: boolean) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  if (!canManage) {
    return <Badge tone={expense.paid ? "gold" : "orange"}>{expense.paid ? "Paid" : "Unpaid"}</Badge>;
  }
  return (
    <button
      onClick={() => start(() => setPaidAction(expense.id, !expense.paid))}
      disabled={pending}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition " +
        (expense.paid
          ? "bg-primary/10 text-primary hover:bg-primary/20"
          : "bg-secondary/10 text-secondary hover:bg-secondary/20")
      }
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : expense.paid ? (
        <Check className="h-3 w-3" />
      ) : null}
      {expense.paid ? "Paid" : "Mark paid"}
    </button>
  );
}

function DeleteExpense({
  expense,
  deleteAction,
}: {
  expense: Expense;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        aria-label="Delete expense"
        className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.10] text-red-500 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => {
          const fd = new FormData();
          fd.set("id", expense.id);
          start(() => Promise.resolve(deleteAction(fd)));
        }}
        disabled={pending}
        className="rounded-lg bg-red-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="rounded-lg border border-black/[0.10] px-2 py-1.5 text-xs text-ink/60 hover:bg-black/[0.03]"
      >
        No
      </button>
    </div>
  );
}

function ExpenseModal({
  expense,
  properties,
  clients,
  action,
  attachmentActions,
  onClose,
}: {
  expense: Expense | null;
  properties: PickProp[];
  clients: PickClient[];
  action: (fd: FormData) => void | Promise<void>;
  attachmentActions: AttachmentActions;
  onClose: () => void;
}) {
  const [paid, setPaid] = useState(expense?.paid ?? false);
  const [category, setCategory] = useState(expense?.category ?? "");
  const [customCat, setCustomCat] = useState(
    expense?.category && !EXPENSE_CATEGORY_OPTIONS.includes(expense.category) ? expense.category : ""
  );
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (expense) fd.set("id", expense.id);
    fd.set("paid", paid ? "1" : "0");
    // categoria: se escolheu "Other…" e digitou custom, usa o custom
    if (category === "__custom__") fd.set("category", customCat.trim());
    if (!fd.get("description")?.toString().trim()) {
      setErr("A description is required.");
      return;
    }
    if (!fd.get("price")?.toString().trim()) {
      setErr("An amount is required.");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await action(fd);
        onClose();
      } catch (er) {
        setErr(er instanceof Error ? er.message : "Could not save. Try again.");
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="h-display text-lg text-ink">{expense ? "Edit expense" : "Add expense"}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink/45 hover:bg-black/[0.04]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Description" hint="What was this expense for?">
            <input name="description" defaultValue={expense?.description ?? ""} className={inputClass} autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount ($)">
              <input name="price" type="number" step="0.01" defaultValue={expense?.price ?? ""} className={inputClass} />
            </Field>
            <Field label="Paid by">
              <select name="paid_by" defaultValue={expense?.paid_by ?? ""} className={inputClass}>
                <option value="">—</option>
                <option value="bythec">By the C</option>
                <option value="owner">Owner</option>
                <option value="tenant">Tenant</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input name="date" type="date" defaultValue={expense?.date ?? today} className={inputClass} />
            </Field>
            <Field label="Due date" hint="Optional.">
              <input name="due_date" type="date" defaultValue={expense?.due_date ?? ""} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} name="category" className={inputClass}>
                <option value="">—</option>
                {EXPENSE_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__custom__">Other (type…)</option>
              </select>
              {category === "__custom__" && (
                <input
                  value={customCat}
                  onChange={(e) => setCustomCat(e.target.value)}
                  placeholder="Custom category"
                  className={inputClass + " mt-2"}
                />
              )}
            </Field>
            <Field label="Vendor" hint="Optional.">
              <input name="vendor" defaultValue={expense?.vendor ?? ""} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Property" hint="Optional.">
              <select name="property_id" defaultValue={expense?.property_id ?? ""} className={inputClass}>
                <option value="">—</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address2 ? `${p.address} · ${p.address2}` : p.address}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Client" hint="Optional.">
              <select name="client_id" defaultValue={expense?.client_id ?? ""} className={inputClass}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4" />
            Already paid
          </label>

          <ExpenseReceipts
            expenseId={expense?.id ?? null}
            initial={expense?.attachments ?? []}
            actions={attachmentActions}
          />

          {err && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {expense ? "Save changes" : "Add expense"}
            </button>
            <button type="button" onClick={onClose} className={buttonClass("ghost")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

type StagedReceipt = { path: string; name: string; type: string };

// Receipts (any file type) for an expense. Works in TWO modes:
//  - edit (expenseId set): each upload persists an expense_attachments row now.
//  - create (expenseId null): each upload is STAGED (file goes to storage, but the
//    row is written by createExpenseAction after the expense exists). Staged items
//    ride along in a hidden `staged_receipts` input on the parent form.
// Uploads go to the private `documents` bucket via the user's session.
function ExpenseReceipts({
  expenseId,
  initial,
  actions,
}: {
  expenseId: string | null;
  initial: ExpenseAttachment[];
  actions: AttachmentActions;
}) {
  const [list, setList] = useState<ExpenseAttachment[]>(initial); // persisted (edit)
  const [staged, setStaged] = useState<StagedReceipt[]>([]); // pending (create)
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setError(null);
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("File is too large. Maximum size is 50 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const path = `expense-receipts/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      if (expenseId) {
        // Edit mode: persist the attachment row immediately.
        const fd = new FormData();
        fd.set("expense_id", expenseId);
        fd.set("file_url", path);
        fd.set("file_name", file.name);
        fd.set("content_type", file.type || "");
        const row = await actions.add(fd);
        setList((l) => [row, ...l]);
      } else {
        // Create mode: stage until the expense is saved.
        setStaged((s) => [{ path, name: file.name, type: file.type || "" }, ...s]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const count = list.length + staged.length;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink/80">Receipts</p>

      {/* Staged uploads ride along on the create form as JSON. */}
      {!expenseId && staged.length > 0 && (
        <input type="hidden" name="staged_receipts" value={JSON.stringify(staged)} />
      )}

      {count > 0 && (
        <div className="mb-2 space-y-1.5">
          {list.map((att) => (
            <ExpenseReceiptRow
              key={att.id}
              att={att}
              onRemoved={(id) => setList((l) => l.filter((a) => a.id !== id))}
              remove={actions.remove}
            />
          ))}
          {staged.map((s) => (
            <div
              key={s.path}
              className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5"
            >
              <FileText className="h-3.5 w-3.5 text-ink/45" />
              <span className="flex-1 truncate text-xs text-ink/80">{s.name}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/35">Pending save</span>
              <button
                type="button"
                onClick={() => setStaged((prev) => prev.filter((x) => x.path !== s.path))}
                className="grid h-6 w-6 place-items-center rounded-md border border-black/[0.08] text-ink/40 transition hover:border-red-300 hover:text-red-500"
                aria-label="Remove receipt"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/15 bg-black/[0.02] px-3 py-2 text-xs font-semibold text-ink/70 transition hover:border-black/30 hover:text-ink">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? "Uploading…" : count > 0 ? "Add another" : "Attach receipt"}
        <input ref={fileRef} type="file" onChange={onPick} className="hidden" disabled={busy} />
      </label>
      <span className="ml-2 text-xs text-ink/40">Any file — photo, PDF, video. Up to 50 MB.</span>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ExpenseReceiptRow({
  att,
  onRemoved,
  remove,
}: {
  att: ExpenseAttachment;
  onRemoved: (id: string) => void;
  remove: (fd: FormData) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setBusy(true);
    try {
      if (/^https?:\/\//i.test(att.file_url)) {
        window.open(att.file_url, "_blank", "noopener,noreferrer");
      } else {
        const supabase = createClient();
        const { data, error: sErr } = await supabase.storage
          .from("documents")
          .createSignedUrl(att.file_url, 60);
        if (sErr || !data?.signedUrl) {
          setError(sErr?.message ?? "Could not open the file.");
          return;
        }
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusy(false);
    }
  }

  function del() {
    const fd = new FormData();
    fd.set("id", att.id);
    start(async () => {
      try {
        await remove(fd);
        onRemoved(att.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove. Try again.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5">
      <FileText className="h-3.5 w-3.5 text-ink/45" />
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="flex-1 truncate text-left text-xs text-ink hover:text-primary"
      >
        {busy ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
        {att.file_name ?? "Receipt"}
        <ExternalLink className="ml-1 inline h-3 w-3 text-ink/30" />
      </button>
      <button
        type="button"
        onClick={del}
        disabled={pending}
        className="grid h-6 w-6 place-items-center rounded-md border border-black/[0.08] text-ink/40 transition hover:border-red-300 hover:text-red-500 disabled:opacity-60"
        aria-label="Remove receipt"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
