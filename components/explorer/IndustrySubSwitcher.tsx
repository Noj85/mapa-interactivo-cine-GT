"use client";

import { Landmark, UserRound } from "lucide-react";
import type { IndustrySub } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { id: IndustrySub; label: string; Icon: typeof Landmark }[] = [
  { id: "entidad", label: "Entidades", Icon: Landmark },
  { id: "persona", label: "Personas", Icon: UserRound },
];

/** Solo en Industria: cambia entre entidades (productoras, servicios…) y personas del directorio. */
export function IndustrySubSwitcher({ sub, onChange }: { sub: IndustrySub; onChange(s: IndustrySub): void }) {
  return (
    <div role="tablist" aria-label="Qué muestra Industria" className="glass flex w-full rounded-2xl border border-line p-1 shadow-soft sm:w-auto">
      {OPTIONS.map(({ id, label, Icon }) => {
        const active = sub === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "relative flex min-h-[32px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3",
              active ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
