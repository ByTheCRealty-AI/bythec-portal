"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/format";

// Lightweight inline-editable <select> for the Sales table rows. Submits a
// server action on change (no Save button), shows a tiny spinner while pending,
// and reverts the visible value if the action throws. The hidden `extra` keys
// (e.g. the row id, and the field name) ride along in the FormData.
//
// `name` is the FormData key the server action reads. `extra` are extra hidden
// fields (always includes the record id). `options` is the dropdown list.
export function InlineSelect({
  name,
  value,
  options,
  extra,
  action,
  placeholder = "—",
  disabled = false,
  className,
}: {
  name: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  extra: Record<string, string>;
  action: (fd: FormData) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [current, setCurrent] = useState<string>(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const prev = useRef<string>(value ?? "");

  if (disabled) {
    const found = options.find((o) => o.value === current);
    return (
      <span className="text-sm text-ink/65">{found?.label ?? placeholder}</span>
    );
  }

  function onChange(next: string) {
    setError(null);
    setCurrent(next);
    const fd = new FormData();
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    fd.set(name, next);
    start(async () => {
      try {
        await action(fd);
        prev.current = next;
      } catch (err) {
        setCurrent(prev.current); // revert on failure
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="relative inline-flex items-center">
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={pending}
          className={cx(
            "appearance-none rounded-lg border border-black/[0.12] bg-white py-1.5 pl-2.5 pr-7 text-xs font-semibold text-ink/80 outline-none transition hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60",
            className
          )}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 flex items-center text-ink/40">
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <svg width="9" height="9" viewBox="0 0 10 6" fill="none" aria-hidden>
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </span>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
