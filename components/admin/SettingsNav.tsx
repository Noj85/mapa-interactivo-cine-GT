"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { settingsGroups } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

/** Barra lateral de Ajustes (arriba en pantallas angostas). Las secciones aún no disponibles se ven atenuadas. */
export function SettingsNav({ counts = {} }: { counts?: Record<string, number | null> }) {
  const path = usePathname();
  return (
    <nav aria-label="Secciones de ajustes" className="space-y-5">
      {settingsGroups().map((g) => (
        <div key={g.name}>
          <h2 className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{g.name}</h2>
          <ul className="space-y-0.5">
            {g.items.map((s) => {
              const href = `/admin/ajustes/${s.id}`;
              const active = path === href || path.startsWith(`${href}/`);
              const count = counts[s.id];
              if (!s.enabled) {
                return (
                  <li key={s.id}>
                    <span
                      aria-disabled="true"
                      title={s.description}
                      className="flex cursor-not-allowed items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-sm text-muted/50"
                    >
                      <span className="truncate">{s.title}</span>
                      <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] uppercase tracking-wide">Pronto</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={s.id}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    <span className="truncate">{s.title}</span>
                    {count != null && <span className="rounded-full bg-bg px-1.5 text-[11px] tabular-nums text-muted">{count}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
