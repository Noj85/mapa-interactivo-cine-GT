import Link from "next/link";
import { RANGES, RANGE_LABELS, type RangeKey } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Selector de periodo: enlaces a /admin/visitas?r=…, para que la página se calcule en el servidor. */
export function RangeTabs({ current }: { current: RangeKey }) {
  return (
    <nav aria-label="Periodo" className="inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/admin/visitas?r=${r}`}
          aria-current={current === r ? "page" : undefined}
          className={cn("rounded-xl px-3.5 py-1.5 text-sm transition-colors", current === r ? "bg-accent text-accent-ink" : "text-muted hover:text-ink")}
        >
          {RANGE_LABELS[r]}
        </Link>
      ))}
    </nav>
  );
}
