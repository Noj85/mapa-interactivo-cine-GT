import type { Ranked } from "@/lib/analytics";

/** Lista con barras (la más grande ocupa todo el ancho). `label` traduce el nombre guardado a texto legible; `unit` es «singular|plural». */
export function RankedList({
  title,
  hint,
  items,
  unit,
  label,
  color = "rgb(var(--accent))",
}: {
  title: string;
  hint?: string;
  items: Ranked[];
  unit?: string;
  label?: (name: string) => string;
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="font-display text-[15px] tracking-tight">{title}</h3>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Sin datos en este periodo.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.name} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate" title={label ? label(it.name) : it.name}>
                  {label ? label(it.name) : it.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {it.n.toLocaleString("es")}
                  {unit ? <span className="ml-1 text-[11px]">{unit.split("|")[it.n === 1 ? 0 : 1]}</span> : null}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, (it.n / max) * 100)}%`, background: color }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
