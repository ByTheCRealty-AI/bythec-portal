"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

export function Tabs({
  tabs,
}: {
  tabs: Array<{ id: string; label: string; content: ReactNode }>;
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-white/[0.08]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={cx(
              "relative px-4 py-2.5 text-sm font-semibold transition",
              active === t.id ? "text-white" : "text-white/45 hover:text-white/75"
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
