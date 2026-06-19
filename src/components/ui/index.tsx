// Primitivos de UI reutilizáveis (premium, sem dependência de lib de componentes).
import { cx } from "@/lib/format";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

// ---- Card ------------------------------------------------------------------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("glass p-6", className)}>{children}</div>;
}

// ---- Badge -----------------------------------------------------------------
// Tons mantidos por nome (usados nas páginas); recoloridos para o tema claro/verde.
type BadgeTone = "gold" | "orange" | "neutral" | "muted";
const TONE: Record<BadgeTone, string> = {
  gold: "bg-primary/10 text-primary border-primary/25",
  orange: "bg-secondary/10 text-secondary border-secondary/25",
  neutral: "bg-black/[0.04] text-ink/70 border-black/10",
  muted: "bg-black/[0.03] text-ink/45 border-black/[0.07]",
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
    "bg-gradient-to-r from-primary to-secondary text-white font-bold shadow-[0_8px_24px_-8px_rgba(25,133,119,0.55)] hover:scale-[1.02]",
  ghost: "border border-black/[0.10] bg-white text-ink/80 hover:bg-black/[0.03] hover:border-black/20",
  danger: "border border-red-300 bg-red-50 text-red-600 hover:bg-red-100",
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.12] bg-black/[0.015] px-8 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="h-display text-lg text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink/55">{message}</p>
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
        <h1 className="h-display text-3xl text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink/55">{subtitle}</p> : null}
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
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink/40">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-ink placeholder-ink/35 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export const selectClass = inputClass;

// ---- No access state -------------------------------------------------------
// Estado limpo quando o usuário não tem a capacidade pra ver a tela.
export function NoAccess({
  message = "You do not have access to this section. Ask an administrator if you need it.",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.12] bg-black/[0.015] px-8 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-black/[0.05] text-ink/45">
        <Lock className="h-6 w-6" />
      </div>
      <h3 className="h-display text-lg text-ink">No access</h3>
      <p className="mt-1 max-w-sm text-sm text-ink/55">{message}</p>
    </div>
  );
}
