"use client";

// Shell responsivo do painel. md+ mostra a sidebar estática (igual antes).
// Abaixo de md, esconde a sidebar e mostra uma top bar com logo + hambúrguer
// que abre a Sidebar como drawer da esquerda sobre um backdrop escurecido.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type SidebarUser } from "@/components/Sidebar";
import type { Capability } from "@/lib/auth/capabilities";
import { Menu, X } from "lucide-react";

export function AppShell({
  caps,
  canManageUsers,
  user,
  children,
}: {
  caps: Capability[];
  canManageUsers: boolean;
  user: SidebarUser;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o drawer ao trocar de rota (defesa extra além do onNavigate).
  useEffect(() => setDrawerOpen(false), [pathname]);

  // Trava o scroll do body enquanto o drawer está aberto.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar estática — só md+ */}
      <div className="hidden md:block">
        <Sidebar caps={caps} canManageUsers={canManageUsers} user={user} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — só abaixo de md */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-black/[0.07] bg-white/80 px-4 py-3 backdrop-blur-sm md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-black/[0.08] bg-white text-ink/65 transition hover:border-black/20 hover:text-ink"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <img src="/logo.png" alt="By the C Realty" className="h-8 w-8 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="h-display truncate text-sm leading-tight text-ink">By the C Realty</p>
              <p className="truncate text-[10px] leading-tight text-ink/45">and Property Management</p>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-6xl animate-fade-up">{children}</div>
        </main>
      </div>

      {/* Drawer mobile + backdrop */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 animate-slide-in-left shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 z-10 grid h-8 w-8 place-items-center rounded-lg text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar
              caps={caps}
              canManageUsers={canManageUsers}
              user={user}
              onNavigate={() => setDrawerOpen(false)}
              className="relative"
            />
          </div>
        </div>
      )}
    </div>
  );
}
