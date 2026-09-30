"use client";

// Renovação do contrato na PÁGINA da propriedade (Andrea 2026-09-28): marcar que
// a renovação foi enviada, se o inquilino aceitou ou recusou, e o que muda
// (novo aluguel + novas datas). É registro — não mexe no lease atual sozinho.
import { useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { setRenewalDetailsAction } from "@/app/(painel)/lease-renewals-actions";
import { money } from "@/lib/format";

type Response = "accepted" | "declined" | null;

export function LeaseRenewalCard({
  id,
  canEdit,
  sentAt,
  response,
  responseAt,
  newRent,
  newStart,
  newEnd,
  currentRent,
  currentEnd,
}: {
  id: string;
  canEdit: boolean;
  sentAt: string | null;
  response: Response;
  responseAt: string | null;
  newRent: number | null;
  newStart: string | null;
  newEnd: string | null;
  currentRent: number | null;
  currentEnd: string | null;
}) {
  const [sent, setSent] = useState(!!sentAt);
  const [resp, setResp] = useState<Response>(response);
  const [rent, setRent] = useState(newRent != null ? String(newRent) : "");
  const [start, setStart] = useState(newStart ?? "");
  const [end, setEnd] = useState(newEnd ?? "");
  const [pending, startT] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const input =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60";
  const day = (d: string | null) =>
    d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

  function save(next?: { sent?: boolean; resp?: Response }) {
    const s = next?.sent ?? sent;
    const r = next?.resp === undefined ? resp : next.resp;
    setErr(null);
    setSaved(false);
    startT(async () => {
      try {
        await setRenewalDetailsAction(id, {
          sent: s,
          response: s ? r : null,
          newRent: rent.trim() === "" ? null : Number(rent),
          newStart: start || null,
          newEnd: end || null,
        });
        setSaved(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  const pill = (active: boolean, tone: "green" | "red") =>
    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 " +
    (active
      ? tone === "green"
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-red-300 bg-red-50 text-red-600"
      : "border-black/10 bg-white text-ink/55 hover:border-black/20");

  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/85">
        <input
          type="checkbox"
          checked={sent}
          disabled={!canEdit || pending}
          onChange={(e) => {
            const v = e.target.checked;
            setSent(v);
            if (!v) setResp(null);
            save({ sent: v, resp: v ? resp : null });
          }}
          className="h-4 w-4 accent-[#198577]"
        />
        <Send className="h-3.5 w-3.5 text-ink/35" />
        Renewal sent to tenant
        {sentAt && <span className="text-xs text-ink/45">· {day(sentAt)}</span>}
      </label>

      {sent && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-ink/45">Tenant</span>
            <button
              type="button"
              disabled={!canEdit || pending}
              onClick={() => { const v: Response = resp === "accepted" ? null : "accepted"; setResp(v); save({ resp: v }); }}
              className={pill(resp === "accepted", "green")}
            >
              Accepted
            </button>
            <button
              type="button"
              disabled={!canEdit || pending}
              onClick={() => { const v: Response = resp === "declined" ? null : "declined"; setResp(v); save({ resp: v }); }}
              className={pill(resp === "declined", "red")}
            >
              Declined
            </button>
            {resp && responseAt && <span className="text-xs text-ink/45">· {day(responseAt)}</span>}
            {!resp && <span className="text-xs text-ink/40">waiting on answer</span>}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink/45">New rent</span>
              <input
                value={rent}
                disabled={!canEdit || pending}
                onChange={(e) => { setRent(e.target.value); setSaved(false); }}
                onBlur={() => save()}
                type="number"
                step="0.01"
                placeholder={currentRent != null ? String(currentRent) : "0.00"}
                className={input}
              />
              {currentRent != null && <span className="mt-1 block text-[11px] text-ink/40">now {money(currentRent)}</span>}
            </div>
            <div>
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink/45">New start</span>
              <input
                value={start}
                disabled={!canEdit || pending}
                onChange={(e) => { setStart(e.target.value); setSaved(false); }}
                onBlur={() => save()}
                type="date"
                className={input}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink/45">New end</span>
              <input
                value={end}
                disabled={!canEdit || pending}
                onChange={(e) => { setEnd(e.target.value); setSaved(false); }}
                onBlur={() => save()}
                type="date"
                className={input}
              />
              {currentEnd && <span className="mt-1 block text-[11px] text-ink/40">now ends {day(currentEnd)}</span>}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink/40">
            This is a record of the renewal. The lease itself only changes when you edit the property.
          </p>
        </>
      )}

      <div className="mt-3 flex items-center gap-3">
        {pending && <span className="text-xs text-ink/45">Saving…</span>}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
