import type { Agg } from "@/lib/aggregate";
import { METRICS, type LayerId, type MetricId } from "@/lib/types";
import { fmtInt, fmtMoney } from "@/lib/utils";

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/** Texto corto del valor de una métrica ("3 películas", "Q 1.2 M"). */
export function metricText(a: Agg | undefined, metric: MetricId, layer: LayerId = "produccion"): string {
  const v = a ? a[metric] : 0;
  if (!v) return "";
  switch (metric) {
    case "films":
      return plural(v, "película", "películas");
    case "days":
      return plural(v, "día", "días");
    case "spend":
      return fmtMoney(v);
    case "jobs":
      return plural(v, "empleo", "empleos");
    case "orgs":
      return layer === "circulacion" ? plural(v, "espacio", "espacios") : plural(v, "empresa", "empresas");
  }
}

export function metricValueText(v: number, metric: MetricId) {
  return METRICS[metric].format === "money" ? fmtMoney(v) : fmtInt(v);
}

export function metricLabel(metric: MetricId, layer: LayerId) {
  if (metric === "orgs") return layer === "circulacion" ? "Espacios de circulación" : "Empresas e instituciones";
  return METRICS[metric].label;
}
