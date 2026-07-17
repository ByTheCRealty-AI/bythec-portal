"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";
import { signOutAction } from "@/app/(painel)/logout/actions";
import {
  LayoutDashboard,
  Users,
  Home,
  FileText,
  Wallet,
  Receipt,
  Wrench,
  Hammer,
  HardHat,
  Building2,
  KeyRound,
  BellRing,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Capability } from "@/lib/auth/capabilities";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  ready: boolean; // funcional nesta rodada?
  cap?: Capability; // capacidade necessária pra VER o item (sem cap = visível a todos os internos)
};

// Ordem dos módulos do painel. Só Clientes e Propriedades são funcionais agora.
const NAV: Item[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, ready: false },
  { href: "/reminders", label: "Reminders", icon: BellRing, ready: true, cap: "reminders.view" },
  // clients.own / properties.own são visíveis a internos E realtor (o RLS escopa
  // o realtor pros próprios registros). Sales segue clients.own.
  { href: "/clientes", label: "Clients", icon: Users, ready: true, cap: "clients.own" },
  { href: "/propriedades", label: "Properties", icon: Home, ready: true, cap: "properties.own" },
  { href: "/invoices", label: "Invoices", icon: FileText, ready: true, cap: "invoices.service" },
  { href: "/payments", label: "Payments", icon: Wallet, ready: true, cap: "payments.annual" },
  { href: "/expenses", label: "Expenses", icon: Receipt, ready: true, cap: "expenses.manage" },
  { href: "/requests", label: "Requests", icon: Wrench, ready: true, cap: "operations.edit" },
  { href: "/services", label: "Services", icon: Hammer, ready: true, cap: "operations.edit" },
  { href: "/providers", label: "Providers", icon: HardHat, ready: true, cap: "providers.view" },
  { href: "/sales", label: "Sales", icon: KeyRound, ready: true, cap: "clients.own" },
  { href: "/listings", label: "Listings", icon: Building2, ready: false, cap: "listings.view" },
];

export type SidebarUser = {
  name: string;
  email: string;
  roleLabel: string;
  initials: string;
};

export function Sidebar({
  caps,
  canManageUsers,
  user,
  remindersBadge = 0,
  onNavigate,
  className,
}: {
  caps: Capability[];
  canManageUsers: boolean;
  user: SidebarUser;
  // Nº de lembretes escalados PRO usuário logado (manager/owner). 0 = sem badge.
  remindersBadge?: number;
  // Chamado ao clicar num link de navegação — usado pelo drawer mobile pra fechar.
  onNavigate?: () => void;
  // Override do shell externo (ex.: static md+ vs. drawer mobile).
  className?: string;
}) {
  const pathname = usePathname();
  const capSet = new Set(caps);

  const visible = NAV.filter((item) => !item.cap || capSet.has(item.cap));

  return (
    <aside
      className={cx(
        "flex h-screen w-64 shrink-0 flex-col border-r border-black/[0.07] bg-white/70 px-4 py-6 backdrop-blur-sm",
        className ?? "sticky top-0"
      )}
    >
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <img src="/logo.png" alt="By the C Realty" className="h-10 w-10 object-contain" />
        <div>
          <p className="h-display text-sm leading-tight text-ink">By the C Realty</p>
          <p className="text-[10px] leading-tight text-ink/45">and Property Management</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {visible.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cx(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-ink/60 hover:bg-black/[0.035] hover:text-ink"
              )}
            >
              <Icon
                className={cx("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-ink/50")}
                strokeWidth={2}
              />
              <span className="flex-1">{item.label}</span>
              {item.href === "/reminders" && remindersBadge > 0 && (
                <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {remindersBadge}
                </span>
              )}
              {!item.ready && (
                <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink/45">
                  Coming soon
                </span>
              )}
            </Link>
          );
        })}

        {canManageUsers && (
          <>
            <div className="my-2 h-px bg-black/[0.06]" />
            <Link
              href="/users"
              onClick={onNavigate}
              className={cx(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                pathname.startsWith("/users")
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-ink/60 hover:bg-black/[0.035] hover:text-ink"
              )}
            >
              <ShieldCheck
                className={cx(
                  "h-[18px] w-[18px] shrink-0",
                  pathname.startsWith("/users") ? "text-primary" : "text-ink/50"
                )}
                strokeWidth={2}
              />
              <span className="flex-1">Users &amp; Access</span>
            </Link>
          </>
        )}
      </nav>

      {/* Rodapé: usuário logado + sign out */}
      <div className="mt-4 rounded-xl border border-black/[0.07] bg-black/[0.015] p-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-bold text-primary">
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-ink/50">{user.roleLabel}</p>
          </div>
        </div>
        <form action={signOutAction} className="mt-2.5">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-semibold text-ink/65 transition hover:border-black/20 hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
