"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

export function Tabs({
  tabs,
  initial,
}: {
  tabs: Array<{ id: string; label: string; content: ReactNode }>;
  // Aba aberta ao carregar (ex.: ?tab=inspections ao voltar da inspeção).
  initial?: string;
}) {
  const [active, setActive] = useState(
    initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id
  );

  return (
    <div>
      {/* 8 abas não cabem no celular: rola na horizontal em vez de quebrar. */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-black/[0.08]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={cx(
              "relative shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition",
              active === t.id ? "text-primary" : "text-ink/50 hover:text-ink/80"
            )}
          >
            {t.label}
            {active === t.id && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-secondary" />
            )}
          </button>
        ))}
      </div>
      <div className="animate-fade-up">{tabs.find((t) => t.id === active)?.content}</div>
    </div>
  );
}
