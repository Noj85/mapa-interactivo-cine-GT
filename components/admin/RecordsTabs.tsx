import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pestañas Películas | Entidades que encabezan los dos listados de registros. */
export function RecordsTabs({ current, films, orgs }: { current: "films" | "orgs"; films: number; orgs: number }) {
  const tabs = [
    { id: "films" as const, href: "/admin/peliculas", label: "Películas", count: films },
    { id: "orgs" as const, href: "/admin/entidades", label: "Entidades", count: orgs },
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
