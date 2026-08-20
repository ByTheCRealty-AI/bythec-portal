"use client";

// =============================================================================
// /applications — lista + modal de detalhe (client).
// =============================================================================

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, date as fmtDate, money } from "@/lib/format";
import {
  APPLICATION_STATUS_LABEL,
  type ApplicationStatus,
  type RentalApplication,
} from "@/lib/types";
import {
  archiveApplicationAction,
  revealSSNAction,
  setApplicationNotesAction,
  setApplicationStatusAction,
  signAttachmentUrl,
} from "./actions";
import { Eye, X, Archive, ExternalLink } from "lucide-react";

const STATUSES: ApplicationStatus[] = ["new", "reviewing", "approved", "denied", "withdrawn"];

const STATUS_CLS: Record<ApplicationStatus, string> = {
  new: "bg-secondary/12 text-secondary border-secondary/25",
  reviewing: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-primary/12 text-primary border-primary/25",
  denied: "bg-red-50 text-red-700 border-red-200",
  withdrawn: "bg-black/[0.04] text-ink/45 border-black/[0.08]",
};

function StatusBadge({ s }: { s: ApplicationStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_CLS[s])}>
      {APPLICATION_STATUS_LABEL[s]}
    </span>
  );
}

function propertyLabel(a: RentalApplication): string {
  if (a.property) return [a.property.address, a.property.address2].filter(Boolean).join(" · ");
  if (a.property_other) return a.property_other;
  return "—";
}

export function ApplicationsClient({ applications }: { applications: RentalApplication[] }) {
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: applications.length };
    for (const s of STATUSES) c[s] = 0;
    for (const a of applications) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [applications]);

  const visible = filter === "all" ? applications : applications.filter((a) => a.status === filter);
  const open = applications.find((a) => a.id === openId) ?? null;

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cx(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              filter === s ? "border-primary bg-primary/10 text-primary" : "border-black/[0.1] text-ink/60 hover:text-ink"
            )}
          >
            {s === "all" ? "All" : APPLICATION_STATUS_LABEL[s]}
            <span className="ml-1.5 text-ink/40">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-black/[0.06] bg-black/[0.015] text-left text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3 font-semibold">Applicant</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">Property</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Submitted</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr
                key={a.id}
                onClick={() => setOpenId(a.id)}
                className="cursor-pointer border-b border-black/[0.04] transition hover:bg-primary/[0.03]"
              >
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink">{a.full_name}</div>
                  <div className="text-xs text-ink/45">
                    {a.email || a.phone || "—"} {a.language === "pt" && <span className="ml-1">· PT</span>}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-ink/70 sm:table-cell">
                  <div>{propertyLabel(a)}</div>
                  {a.rental_type && (
                    <div className="text-xs text-ink/45">{rentalTypeLabel(a.rental_type)}</div>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-ink/60 md:table-cell">{fmtDate(a.submitted_at)}</td>
                <td className="px-4 py-3">
                  <StatusBadge s={a.status} />
                </td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-primary">Open</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <DetailModal application={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// =============================================================================
// Modal de detalhe (portal-to-body, centralizado — padrão do portal).
// =============================================================================
function DetailModal({ application: a, onClose }: { application: RentalApplication; onClose: () => void }) {
  const [status, setStatus] = useState<ApplicationStatus>(a.status);
  const [notes, setNotes] = useState(a.internal_notes ?? "");
  const [ssn, setSsn] = useState<string | null>(null);
  const [ssnLoading, setSsnLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onStatus = async (s: ApplicationStatus) => {
    setStatus(s);
    setBusy(true);
    setErr(null);
    try {
      await setApplicationStatusAction(a.id, s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update status.");
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    setSsnLoading(true);
    setErr(null);
    try {
      setSsn(await revealSSNAction(a.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reveal SSN.");
    } finally {
      setSsnLoading(false);
    }
  };

  const saveNotes = async () => {
    setBusy(true);
    setErr(null);
    try {
      await setApplicationNotesAction(a.id, notes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save notes.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!confirm("Archive this application? It will be hidden from the list.")) return;
    setBusy(true);
    try {
      await archiveApplicationAction(a.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to archive.");
      setBusy(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-black/[0.08] bg-white shadow-2xl">
        {/* Header sticky */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-black/[0.06] bg-white/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="h-display truncate text-lg text-ink">{a.full_name}</h2>
            <p className="text-xs text-ink/50">
              {fmtDate(a.submitted_at)} · {propertyLabel(a)}
            </p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink/45 hover:bg-black/[0.04] hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {err && <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</div>}

          {/* Status control */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => onStatus(s)}
                  className={cx(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
                    status === s ? STATUS_CLS[s] : "border-black/[0.1] text-ink/55 hover:text-ink"
                  )}
                >
                  {APPLICATION_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Rental */}
          <Group title="Rental">
            <Row label="Rental type">{rentalTypeLabel(a.rental_type)}</Row>
            <Row label="Desired start">{a.lease_start ? fmtDate(a.lease_start) : "—"}</Row>
            <Row label="Property">{propertyLabel(a)}</Row>
          </Group>

          {/* Payment */}
          <Group title="Application fee">
            <Row label="Fee">{money(a.fee_amount)}</Row>
            <Row label="Payment">
              {a.payment_status === "paid" ? (
                <span className="font-semibold text-primary">Paid{a.paid_at ? ` · ${fmtDate(a.paid_at)}` : ""}</span>
              ) : (
                <span className="text-ink/50">Unpaid</span>
              )}
            </Row>
          </Group>

          {/* Applicant */}
          <Group title="Applicant">
            <Row label="Full name">{a.full_name}</Row>
            <Row label="Date of birth">{a.date_of_birth || "—"}</Row>
            <Row label="SSN / ITIN">
              {a.has_ssn === false ? (
                <span className="text-ink/70">No SSN/ITIN{a.ssn_none_explanation ? ` — ${a.ssn_none_explanation}` : ""}</span>
              ) : ssn ? (
                <span className="font-mono">{ssn}</span>
              ) : a.ssn_last4 ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono">•••-••-{a.ssn_last4}</span>
                  <button
                    type="button"
                    onClick={reveal}
                    disabled={ssnLoading}
                    className="inline-flex items-center gap-1 rounded-md border border-black/[0.1] px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/[0.05] disabled:opacity-50"
                  >
                    <Eye className="h-3 w-3" /> {ssnLoading ? "…" : "Reveal"}
                  </button>
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Phone">{a.phone || "—"}</Row>
            <Row label="Email">{a.email || "—"}</Row>
            <Row label={a.has_license === false ? "Government ID" : "Driver's license"}>
              {a.has_license === false
                ? [govIdLabel(a.gov_id_type), a.gov_id_number].filter(Boolean).join(": ") || "—"
                : [a.drivers_license, a.drivers_license_state].filter(Boolean).join(" / ") || "—"}
            </Row>
          </Group>

          {/* Occupants */}
          {(a.occupants_count || (a.occupants && a.occupants.length > 0)) && (
            <Group title={`Occupants${a.occupants_count ? ` (${a.occupants_count})` : ""}`}>
              {(a.occupants ?? []).map((o, i) => (
                <Row key={i} label={o.name || `Occupant ${i + 1}`}>
                  {[o.dob, o.is_adult ? "18+" : null, o.phone].filter(Boolean).join(" · ") || "—"}
                </Row>
              ))}
            </Group>
          )}

          {/* Government IDs */}
          {a.attachments && a.attachments.length > 0 && (
            <Group title="Government IDs">
              {a.attachments.map((att) => (
                <Row
                  key={att.id}
                  label={att.category === "applicant_id" ? "Applicant" : att.label || `Occupant ${(att.occupant_index ?? 0) + 1}`}
                >
                  <IdViewButton filePath={att.file_path} name={att.file_name} />
                </Row>
              ))}
            </Group>
          )}

          {/* Rental history */}
          {a.rental_history && a.rental_history.length > 0 && (
            <Group title="Rental history">
              {a.rental_history.map((h, i) => (
                <div key={i} className="rounded-lg border border-black/[0.05] bg-page/50 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                    {h.kind === "current" ? "Current" : "Previous"}
                  </p>
                  <p className="text-ink">{[h.street, h.city, h.state, h.zip].filter(Boolean).join(", ") || "—"}</p>
                  <p className="text-xs text-ink/55">
                    {[h.duration, h.landlord_name, h.landlord_phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))}
            </Group>
          )}

          {/* Vehicles */}
          {a.vehicles && a.vehicles.length > 0 && (
            <Group title="Vehicles">
              {a.vehicles.map((v, i) => (
                <Row key={i} label={v.make_model || `Vehicle ${i + 1}`}>
                  {[v.year, v.color, [v.plate, v.plate_state].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </Row>
              ))}
            </Group>
          )}

          {/* Employment */}
          <Group title="Employment">
            <Row label="Employer">{a.employer || "—"}</Row>
            <Row label="Employer address">{a.employer_address || "—"}</Row>
            <Row label="Manager">{[a.manager_name, a.manager_phone].filter(Boolean).join(" · ") || "—"}</Row>
            <Row label="Job title">{a.job_title || "—"}</Row>
            <Row label="Monthly income">{a.monthly_income != null ? money(a.monthly_income) : "—"}</Row>
            <Row label="Length of employment">{a.length_of_employment || "—"}</Row>
          </Group>

          {/* References */}
          {a.personal_references && a.personal_references.length > 0 && (
            <Group title="References">
              {a.personal_references.map((r, i) => (
                <Row key={i} label={r.name || `Reference ${i + 1}`}>{r.phone || "—"}</Row>
              ))}
            </Group>
          )}

          {/* Additional */}
          <Group title="Additional">
            <Row label="Evicted">{yn(a.evicted, a.evicted_detail)}</Row>
            <Row label="Felony">{yn(a.felony, a.felony_detail)}</Row>
            <Row label="Bankruptcy">{yn(a.bankruptcy, a.bankruptcy_detail)}</Row>
            <Row label="Smokes">{yn(a.smokes)}</Row>
            <Row label="Pets">{yn(a.has_pets, a.pets_detail)}</Row>
            <Row label="Reason for moving">{a.reason_for_moving || "—"}</Row>
          </Group>

          {/* Consent */}
          <Group title="Consent & signature">
            <Row label="Consent">{a.consent_agreed ? "Agreed (background & credit check authorized)" : "Not agreed"}</Row>
            <Row label="Signature">{[a.signature_name, a.signature_date].filter(Boolean).join(" · ") || "—"}</Row>
            {a.signature_name_2 && (
              <Row label="Second signature">{[a.signature_name_2, a.signature_date_2].filter(Boolean).join(" · ")}</Row>
            )}
            <Row label="Submitted from IP">{a.consent_ip || "—"}</Row>
          </Group>

          {/* Internal notes */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">Internal notes</p>
            <textarea
              className="w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Notes visible only to By the C staff…"
            />
          </div>

          {a.ssn_last_revealed_at && (
            <p className="text-xs text-ink/40">SSN last revealed {fmtDate(a.ssn_last_revealed_at)}.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-black/[0.06] px-6 py-4">
          <button
            type="button"
            onClick={archive}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-black/[0.1] px-3 py-2 text-sm font-medium text-ink/55 transition hover:text-red-600 disabled:opacity-50"
          >
            <Archive className="h-4 w-4" /> Archive
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-40 shrink-0 text-ink/50">{label}</span>
      <span className="min-w-0 flex-1 text-ink">{children}</span>
    </div>
  );
}

function yn(v: boolean | null | undefined, detail?: string | null): string {
  if (v == null) return "—";
  const base = v ? "Yes" : "No";
  return v && detail ? `${base} — ${detail}` : base;
}

function rentalTypeLabel(t: string | null | undefined): string {
  if (t === "year_round") return "Year-round";
  if (t === "winter") return "Winter / off-season";
  return "—";
}

function govIdLabel(t: string | null): string {
  if (t === "state_id") return "State ID card";
  if (t === "passport") return "Passport";
  return "Government ID";
}

// Abre uma URL assinada (5 min) pra ver a foto/arquivo do ID. Nunca embute o
// arquivo direto — busca o link sob demanda e abre em nova aba.
function IdViewButton({ filePath, name }: { filePath: string; name: string | null }) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const url = await signAttachmentUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore — botão volta ao normal */
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-md border border-black/[0.1] px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/[0.05] disabled:opacity-50"
    >
      <ExternalLink className="h-3 w-3" /> {loading ? "…" : "View ID"}
      {name && <span className="max-w-[130px] truncate text-ink/40">· {name}</span>}
    </button>
  );
}
