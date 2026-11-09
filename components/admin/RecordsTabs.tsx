import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pestañas Producciones | Entidades | Personas que encabezan los listados de registros. */
export function RecordsTabs({ current, films, orgs, people = 0 }: { current: "films" | "orgs" | "people"; films: number; orgs: number; people?: number }) {
  const tabs = [
    { id: "films" as const, href: "/admin/peliculas", label: "Producciones", count: films },
    { id: "orgs" as const, href: "/admin/entidades", label: "Entidades", count: orgs },
    { id: "people" as const, href: "/admin/personas", label: "Personas", count: people },
  ];
  return (
    <div role="tablist" aria-label="Tipo de registro" className="mb-6 inline-flex rounded-2xl border border-line bg-surface p-1">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          role="tab"
          aria-selected={current === t.id}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm transition-colors",
            current === t.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
          <span className="rounded-full bg-bg px-1.5 text-[11px] tabular-nums text-muted">{t.count}</span>
        </Link>
      ))}
    </div>
  );
}
