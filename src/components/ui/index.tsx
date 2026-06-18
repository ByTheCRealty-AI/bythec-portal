// Primitivos de UI reutilizáveis (premium, sem dependência de lib de componentes).
import { cx } from "@/lib/format";
import type { ReactNode } from "react";

// ---- Card ------------------------------------------------------------------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("glass p-6", className)}>{children}</div>;
}

// ---- Badge -----------------------------------------------------------------
type BadgeTone = "gold" | "orange" | "neutral" | "muted";
const TONE: Record<BadgeTone, string> = {
  gold: "bg-primary/15 text-primary border-primary/30",
  orange: "bg-secondary/15 text-secondary border-secondary/30",
  neutral: "bg-white/10 text-white/80 border-white/15",
  muted: "bg-white/5 text-white/45 border-white/10",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-tight",
        TONE[tone]
      )}
    >
      {children}
    </span>
  );
}

// ---- Button (link styled) --------------------------------------------------
type ButtonVariant = "primary" | "ghost" | "danger";
const BTN: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-primary to-secondary text-black font-bold shadow-[0_0_24px_-6px_rgba(250,204,21,0.5)] hover:scale-[1.02]",
  ghost: "border border-white/10 bg-white/5 text-white/85 hover:bg-white/10 hover:border-white/20",
  danger: "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
};

export function buttonClass(variant: ButtonVariant = "primary"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-all duration-200",
    BTN[variant]
  );
}

// ---- Empty state -----------------------------------------------------------
// TRAVADO no design system: empty state nunca vazio — ícone + mensagem + CTA.
export function EmptyState({
  icon,
  title,
  message,
  cta,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  cta?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-8 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-primary">
        {icon}
      </div>
      <h3 className="h-display text-lg text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-white/50">{message}</p>
      {cta ? <div className="mt-5">{cta}</div> : null}
    </div>
  );
}

// ---- Page header -----------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="h-display text-3xl text-white">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-white/50">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---- Field (label + input wrapper) ----------------------------------------
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/45">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-white/35">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:bg-white/[0.05]";
