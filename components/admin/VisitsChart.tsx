"use client";

import { useId, useMemo, useState } from "react";
import type { DayPoint } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "views", label: "Páginas vistas" },
  { key: "visitors", label: "Visitantes únicos" },
  { key: "films", label: "Producciones abiertas" },
  { key: "downloads", label: "Descargas" },
] as const;
type Metric = (typeof METRICS)[number]["key"];

const W = 900;
const H = 260;
const PAD = { l: 40, r: 12, t: 14, b: 28 };

/** Valor «redondo» para el techo del eje (1, 2, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const fmtDay = (d: string, long = false) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("es", { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" });
};

/** Gráfica de área por día (SVG, sin dependencias) con selector de métrica y detalle al pasar el cursor. */
export function VisitsChart({ data }: { data: DayPoint[] }) {
  const [metric, setMetric] = useState<Metric>("views");
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();

  const { pts, max, line, area, ticks } = useMemo(() => {
    const vals = data.map((p) => p[metric]);
    const max = niceMax(Math.max(0, ...vals));
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (i: number) => PAD.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v: number) => PAD.t + ih - (v / max) * ih;
    const pts = vals.map((v, i) => ({ x: x(i), y: y(v), v }));
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = pts.length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${PAD.t + ih} L${pts[0].x.toFixed(1)},${PAD.t + ih} Z` : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: Math.round(max * t), y: y(max * t) }));
    return { pts, max, line, area, ticks };
  }, [data, metric]);

  const total = useMemo(() => data.reduce((s, p) => s + p[metric], 0), [data, metric]);
  // etiquetas del eje horizontal: unas 6, repartidas
  const labelIdx = useMemo(() => {
    if (data.length <= 7) return data.map((_, i) => i);
    const step = Math.ceil(data.length / 6);
    return data.map((_, i) => i).filter((i) => i % step === 0);
  }, [data]);

  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  const h = hover != null ? pts[hover] : null;
  const hd = hover != null ? data[hover] : null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Métrica de la gráfica" className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn("rounded-lg px-3 py-1.5 text-xs transition-colors", metric === m.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="text-right text-xs text-muted">
          <span className="font-display text-2xl tracking-tight text-ink">{total.toLocaleString("es")}</span>{" "}
          {metric === "visitors" ? "visitantes-día" : "en el periodo"}
        </div>
      </div>

      <div className="relative mt-3">
        {data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted">Sin datos en este periodo.</div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Gráfica diaria de ${METRICS.find((m) => m.key === metric)!.label.toLowerCase()}`}
            onMouseMove={move}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--grad-a))" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(var(--grad-b))" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id={`${gid}-line`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgb(var(--grad-a))" />
                <stop offset="100%" stopColor="rgb(var(--grad-b))" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t.y}>
                <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke="rgb(var(--line))" strokeDasharray={t.v === 0 ? undefined : "3 4"} />
                <text x={PAD.l - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
                  {t.v.toLocaleString("es")}
                </text>
              </g>
            ))}
            <path d={area} fill={`url(#${gid}-fill)`} />
            <path d={line} fill="none" stroke={`url(#${gid}-line)`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {labelIdx.map((i) => (
              <text key={i} x={pts[i].x} y={H - 8} textAnchor={i === data.length - 1 && data.length > 1 ? "end" : i === 0 && data.length > 1 ? "start" : "middle"} fontSize="11" fill="rgb(var(--muted))">
                {fmtDay(data[i].d)}
              </text>
            ))}
            {h && (
              <g>
                <line x1={h.x} x2={h.x} y1={PAD.t} y2={H - PAD.b} stroke="rgb(var(--accent))" strokeOpacity="0.4" />
                <circle cx={h.x} cy={h.y} r="5" fill="rgb(var(--surface))" stroke="rgb(var(--accent))" strokeWidth="2.5" />
              </g>
            )}
          </svg>
        )}
        {h && hd && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-float"
            style={{ left: `${Math.min(88, Math.max(12, (h.x / W) * 100))}%`, top: 0 }}
          >
            <div className="text-muted">{fmtDay(hd.d, true)}</div>
            <div className="mt-0.5 font-display text-base text-ink">{h.v.toLocaleString("es")}</div>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">Días en hora de Guatemala. El techo de la gráfica se ajusta al día más alto ({max.toLocaleString("es")}).</p>
    </section>
  );
}
