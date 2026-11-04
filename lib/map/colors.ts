import type { LayerId } from "@/lib/types";

export type Theme = "dark" | "light";

export const LAYER_COLORS: Record<LayerId, { dark: string; light: string }> = {
  produccion: { dark: "#e8b04a", light: "#c9820f" },
  circulacion: { dark: "#5ec4b6", light: "#12877a" },
  industria: { dark: "#a98bf0", light: "#6b46c8" },
};

export const MAP_BG: Record<Theme, string> = { dark: "#0b0f19", light: "#eef1f5" };

const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** 5 pasos de la coropleta, del más tenue al más intenso. */
export function ramp(layer: LayerId, theme: Theme): string[] {
  const base = LAYER_COLORS[layer][theme];
  const bg = MAP_BG[theme];
  const steps = theme === "dark" ? [0.2, 0.38, 0.58, 0.8, 1] : [0.22, 0.4, 0.6, 0.8, 1];
  return steps.map((s) => mix(bg, base, s));
}

// ---------- conversión HSL para oscurecer el estilo base ----------

function parseColor(str: string): [number, number, number, number] | null {
  const s = str.trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  m = s.match(/^hsla?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    const [h, sat, l] = [p[0], p[1] / 100, p[2] / 100];
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0) * 255, f(8) * 255, f(4) * 255, p[3] ?? 1];
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

/** Invierte la luminosidad y añade un tinte azul noche para el tema oscuro. */
export function darkenColor(str: string): string {
  const c = parseColor(str);
  if (!c) return str;
  const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
  // mapa de luminosidad: claro (1) -> oscuro (~0.07); oscuro (0) -> claro (~0.72)
  const nl = 0.06 + (1 - l) * 0.14 + (l < 0.4 ? (0.4 - l) * 1.0 : 0);
  const hue = s < 0.15 ? 218 : h;
  const sat = s < 0.15 ? 0.16 : Math.min(0.5, s * 0.7);
  return `hsla(${hue.toFixed(0)},${(sat * 100).toFixed(0)}%,${(nl * 100).toFixed(1)}%,${c[3]})`;
}

export function darkenExpr(v: unknown): unknown {
  if (typeof v === "string") return /^(#|rgb|hsl)/i.test(v) ? darkenColor(v) : v;
  if (Array.isArray(v)) return v.map(darkenExpr);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = darkenExpr(x);
    return o;
  }
  return v;
}
