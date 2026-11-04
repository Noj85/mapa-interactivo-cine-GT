import type { GazetteerEntry } from "@/lib/types";
import { normalize } from "@/lib/utils";

export interface GeoMatch {
  entry: GazetteerEntry;
  /** 0..1 */
  score: number;
  exact: boolean;
}

/**
 * Índice en memoria de departamentos y municipios.
 * Se usa en el navegador (buscador) y en el servidor (carga inteligente).
 */
export class Gazetteer {
  readonly entries: GazetteerEntry[];
  private byCode = new Map<string, GazetteerEntry>();
  private keys: { entry: GazetteerEntry; key: string; alias: boolean }[] = [];

  constructor(entries: GazetteerEntry[]) {
    this.entries = entries;
    for (const e of entries) {
      this.byCode.set(`${e.type}:${e.code}`, e);
      this.keys.push({ entry: e, key: normalize(e.name), alias: false });
      for (const a of e.aliases) this.keys.push({ entry: e, key: normalize(a), alias: true });
    }
  }

  depto(code: number | null | undefined) {
    return code == null ? undefined : this.byCode.get(`depto:${code}`);
  }

  muni(code: number | null | undefined) {
    return code == null ? undefined : this.byCode.get(`muni:${code}`);
  }

  munisOf(deptoCode: number) {
    return this.entries.filter((e) => e.type === "muni" && e.depto_ine === deptoCode);
  }

  /** Buscador para la interfaz: prefijo, palabras y alias. */
  search(query: string, limit = 8): GeoMatch[] {
    const q = normalize(query);
    if (!q) return [];
    const out = new Map<string, GeoMatch>();
    for (const { entry, key, alias } of this.keys) {
      let score = 0;
      if (key === q) score = 1;
      else if (key.startsWith(q)) score = 0.85;
      else if (key.split(" ").some((w) => w.startsWith(q))) score = 0.65;
      else if (key.includes(q)) score = 0.45;
      if (!score) continue;
      if (alias) score -= 0.03;
      if (entry.type === "depto") score += 0.02;
      const id = `${entry.type}:${entry.code}`;
      const prev = out.get(id);
      if (!prev || prev.score < score) out.set(id, { entry, score, exact: key === q });
    }
    return [...out.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Resuelve un texto libre ("Xela", "Panajachel, Sololá", "Atitlán") a un
   * municipio. Devuelve todos los candidatos plausibles: si hay más de uno con
   * puntaje parecido, la carga inteligente debe preguntar.
   */
  resolve(text: string, hintDepto?: string | number | null): GeoMatch[] {
    const raw = text.trim();
    if (!raw) return [];
    let deptoCode: number | null = null;
    if (typeof hintDepto === "number") deptoCode = hintDepto;
    else if (hintDepto) {
      const h = this.search(String(hintDepto), 1)[0];
      if (h?.entry.type === "depto") deptoCode = h.entry.code;
    }

    const parts = raw.split(/[,;\/|]| - | – | — /).map((p) => p.trim()).filter(Boolean);
    // "Flores Petén": si el texto completo no existe, probar a partirlo en dos
    // ("Flores" + "Petén") para que el departamento desambigüe el municipio.
    if (parts.length === 1 && !this.search(parts[0], 1).some((m) => m.score >= 0.85)) {
      const words = parts[0].split(/\s+/);
      if (words.length >= 2 && words.length <= 5) {
        for (let k = 1; k < words.length; k++) {
          const left = words.slice(0, k).join(" ");
          const right = words.slice(k).join(" ");
          const l = this.search(left, 1)[0];
          const r = this.search(right, 1)[0];
          if (l?.score >= 0.85 && r?.score >= 0.85 && (l.entry.type === "depto") !== (r.entry.type === "depto")) {
            parts.splice(0, 1, left, right);
            break;
          }
        }
      }
    }
    const candidates = new Map<string, GeoMatch>();
    const consider = (m: GeoMatch) => {
      const id = `${m.entry.type}:${m.entry.code}`;
      const prev = candidates.get(id);
      if (!prev || prev.score < m.score) candidates.set(id, m);
    };

    // En "Panajachel, Sololá" el último trozo es el departamento: no debe competir como municipio
    // (Sololá también es un municipio y haría la respuesta ambigua).
    const asDepto = (p: string) => this.search(p, 4).find((m) => m.entry.type === "depto" && m.score >= 0.85);
    parts.forEach((part, i) => {
      const isDeptoHint = i > 0 && parts.length > 1 && !!asDepto(part);
      for (const m of this.search(part, 6)) {
        if (m.score < 0.6) continue;
        if (isDeptoHint && m.entry.type === "muni") continue;
        consider(m);
      }
    });
    // Si el texto completo menciona un departamento, desambiguar
    for (const part of parts) {
      const d = this.search(part, 1)[0];
      if (d && d.entry.type === "depto" && d.score >= 0.85) deptoCode = deptoCode ?? d.entry.code;
    }
    let list = [...candidates.values()];
    // Preferir municipios; si solo hay departamento, devolver departamento
    const munis = list.filter((m) => m.entry.type === "muni");
    if (munis.length) list = munis;
    if (deptoCode != null) {
      const inDepto = list.filter((m) => m.entry.depto_ine === deptoCode);
      if (inDepto.length) list = inDepto;
    }
    // "Sacatepéquez" existe como depto y varios municipios: si hay exacto preferirlo
    return list.sort((a, b) => b.score - a.score).slice(0, 5);
  }
}

export function bboxCenter(b: [number, number, number, number]): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
