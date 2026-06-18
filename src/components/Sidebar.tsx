"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";
import {
  LayoutDashboard,
  Users,
  Home,
  FileText,
  Wallet,
  Receipt,
  Wrench,
  HardHat,
  Building2,
  Anchor,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  ready: boolean; // funcional nesta rodada?
};

// Ordem dos módulos do painel. Só Clientes e Propriedades são funcionais agora.
const NAV: Item[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, ready: false },
  { href: "/clientes", label: "Clients", icon: Users, ready: true },
  { href: "/propriedades", label: "Properties", icon: Home, ready: true },
  { href: "/invoices", label: "Invoices", icon: FileText, ready: false },
  { href: "/payments", label: "Payments", icon: Wallet, ready: false },
  { href: "/expenses", label: "Expenses", icon: Receipt, ready: false },
  { href: "/requests", label: "Requests", icon: Wrench, ready: false },
  { href: "/providers", label: "Providers", icon: HardHat, ready: false },
  { href: "/listings", label: "Listings", icon: Building2, ready: false },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-black/[0.07] bg-white/70 px-4 py-6 backdrop-blur-sm">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-glow">
          <Anchor className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div>
          <p className="h-display text-sm leading-tight text-ink">By the C</p>
          <p className="text-[10px] uppercase tracking-widest text-ink/45">Dashboard</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
              {!item.ready && (
                <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink/45">
                  Coming soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-black/[0.07] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-ink/50">
        Wave 2 · custom build
        <br />
        Cape Cod, MA · America/New_York
      </div>
    </aside>
  );
}
