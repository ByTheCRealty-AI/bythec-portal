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
  { href: "/clientes", label: "Clientes", icon: Users, ready: true },
  { href: "/propriedades", label: "Propriedades", icon: Home, ready: true },
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
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.015] px-4 py-6 backdrop-blur-sm">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-black">
          <Anchor className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div>
          <p className="h-display text-sm leading-tight text-white">By the C</p>
          <p className="text-[10px] uppercase tracking-widest text-white/40">Painel</p>
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
                  ? "bg-white/[0.07] text-white"
                  : "text-white/55 hover:bg-white/[0.04] hover:text-white/90"
              )}
            >
              <Icon
                className={cx("h-[18px] w-[18px] shrink-0", active && "text-primary")}
                strokeWidth={2}
              />
              <span className="flex-1">{item.label}</span>
              {!item.ready && (
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/35">
                  em breve
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/40">
        Onda 2 · build próprio
        <br />
        Cape Cod, MA · America/New_York
      </div>
    </aside>
  );
}
