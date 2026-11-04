"use client";

import type { Stop } from "@/lib/aggregate";
import { metricLabel, metricValueText } from "@/lib/format";
import { ramp, type Theme } from "@/lib/map/colors";
import type { LayerId, MetricId } from "@/lib/types";

export function Legend({
  layer,
  metric,
  theme,
  scope,
  stops,
  dimmed,
}: {
  layer: LayerId;
  metric: MetricId;
  theme: Theme;
  scope: "depto" | "muni";
  stops: Stop[];
  dimmed?: boolean;
}) {
  const colors = ramp(layer, theme);
  if (dimmed) return null;
  return (
    <div className="glass rounded-2xl border border-line px-3.5 py-3 shadow-soft">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {metricLabel(metric, layer)}
        <span className="ml-1 normal-case tracking-normal text-muted/70">
          · por {scope === "muni" ? "municipio" : "departamento"}
        </span>
      </div>
      {stops.length === 0 ? (
        <div className="mt-2 text-xs text-muted">Sin datos para mostrar.</div>
      ) : (
        <div className="mt-2 flex items-end gap-1">
          {stops.map((s, i) => (
            <div key={i} className="flex min-w-[34px] flex-col items-start gap-1">
              <span className="h-2.5 w-full rounded-sm" style={{ background: colors[s.color - 1] }} />
              <span className="text-[11px] tabular-nums text-muted">
                {metricValueText(s.from, metric)}
                {i === stops.length - 1 ? "+" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-line" /> Sin registros
        </span>
      </div>
    </div>
  );
}
