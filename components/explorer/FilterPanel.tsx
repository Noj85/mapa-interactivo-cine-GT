"use client";

import { Check, Copy, Download, Plus, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { YearRange } from "@/components/ui/YearRange";
import { EMPTY_FILM_FILTER, EMPTY_ORG_FILTER, ORG_CATEGORIES, type FilmFilter, type OrgFilter } from "@/lib/filters";
import { FORMATS, genreOptions, NATURES } from "@/lib/film-types";
import { INITIATIVE_TYPES, NATIONALITIES, type LayerId } from "@/lib/types";
import { cn, fmtInt } from "@/lib/utils";
import { activeFilterCount } from "@/lib/view";

interface Props {
  layer: LayerId;
  filmFilter: FilmFilter;
  orgFilter: OrgFilter;
  /** Registros de la capa que cumplen los filtros, y cuántos hay en total. */
  count: number;
  total: number;
  /** Categorías que de verdad existen en los datos (además de las conocidas). */
  extraCategories: string[];
  /** Géneros propios que existen en los datos de producción. */
  extraGenres: string[];
  /** Opciones del filtro de idioma: los que existen en los datos de producción (vacío = no se ofrece). */
  languages: { value: string; label: string; group?: string }[];
  onFilm(f: FilmFilter): void;
  onOrg(f: OrgFilter): void;
  /** Enlace a /descargas con los mismos filtros. */
  downloadHref: string;
  /** Teléfono: el botón es solo el ícono (con la cuenta de filtros activos). */
  compact?: boolean;
  /** Filtros que no se ofrecen (por ejemplo, las cifras de rodaje que el público no ve). */
  hiddenFields?: string[];
}

interface Field {
  id: string;
  label: string;
  active: boolean;
  clear(): void;
  /** El control ya trae su propia etiqueta (los selectores múltiples). */
  ownLabel?: boolean;
  node: ReactNode;
}

const digits = (s: string) => s.replace(/[^\d]/g, "");
const group = (n: number | null) => (n == null ? "" : n.toLocaleString("es-GT"));
const toNum = (s: string) => (digits(s) ? Number(digits(s)) : null);

function Range({
  label,
  min,
  max,
  onChange,
  grouped = true,
  maxLength,
  hints = ["Desde", "Hasta"],
}: {
  label: string;
  min: number | null;
  max: number | null;
  onChange(min: number | null, max: number | null): void;
  grouped?: boolean;
  maxLength?: number;
  hints?: [string, string];
}) {
  const show = (n: number | null) => (grouped ? group(n) : n == null ? "" : String(n));
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        aria-label={`${label}: ${hints[0].toLowerCase()}`}
        className="field"
        inputMode="numeric"
        placeholder={hints[0]}
        maxLength={maxLength}
        value={show(min)}
        onChange={(e) => onChange(toNum(e.target.value), max)}
      />
      <input
        aria-label={`${label}: ${hints[1].toLowerCase()}`}
        className="field"
        inputMode="numeric"
        placeholder={hints[1]}
        maxLength={maxLength}
        value={show(max)}
        onChange={(e) => onChange(min, toNum(e.target.value))}
      />
    </div>
  );
}

/**
 * Botón «Filtros» y su panel. Sin filtros es solo un botón; los filtros se agregan a la carta y se ven
 * como filas que se quitan con una «×».
 */
export function FilterPanel(p: Props) {
  const { layer, filmFilter: ff, orgFilter: of } = p;
  const isFilm = layer === "produccion";
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // los campos agregados a mano pertenecen a la capa: al cambiar de capa se vacían
  useEffect(() => {
    setAdded([]);
    setAdding(false);
  }, [layer]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Element;
      // los menús de los selectores se pintan fuera del card: usarlos no lo cierra
      if (!root.current?.contains(t) && !t.closest?.("[data-floating-menu]")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // con un menú abierto, Escape cierra primero el menú
      if (document.querySelector("[data-floating-menu]")) return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  const pf = (patch: Partial<FilmFilter>) => p.onFilm({ ...ff, ...patch });
  const po = (patch: Partial<OrgFilter>) => p.onOrg({ ...of, ...patch });

  const fields: Field[] = useMemo(() => {
    if (isFilm) {
      return [
        {
          id: "formato",
          label: "Formato",
          ownLabel: true,
          active: ff.formato.length > 0,
          clear: () => pf({ formato: [] }),
          node: <MultiSelect label="Formato" placeholder="Todos" value={ff.formato} onChange={(formato) => pf({ formato })} options={FORMATS.map((k) => ({ value: k.id, label: k.label }))} />,
        },
        {
          id: "naturaleza",
          label: "Naturaleza",
          ownLabel: true,
          active: ff.naturaleza.length > 0,
          clear: () => pf({ naturaleza: [] }),
          node: <MultiSelect label="Naturaleza" placeholder="Cualquiera" value={ff.naturaleza} onChange={(naturaleza) => pf({ naturaleza })} options={NATURES.map((k) => ({ value: k.id, label: k.label }))} />,
        },
        {
          id: "genero",
          label: "Género",
          ownLabel: true,
          active: ff.genero.length > 0,
          clear: () => pf({ genero: [] }),
          node: <MultiSelect label="Género" placeholder="Todos" value={ff.genero} onChange={(genero) => pf({ genero })} options={genreOptions(p.extraGenres)} searchable />,
        },
        // solo se ofrece si alguna producción tiene idiomas (o ya hay uno elegido en el enlace)
        ...(p.languages.length > 0 || ff.idioma.length > 0
          ? [
              {
                id: "idioma",
                label: "Idioma",
                ownLabel: true,
                active: ff.idioma.length > 0,
                clear: () => pf({ idioma: [] }),
                node: <MultiSelect label="Idioma" placeholder="Todos" value={ff.idioma} onChange={(idioma) => pf({ idioma })} options={p.languages} searchable />,
              } satisfies Field,
            ]
          : []),
        {
          id: "nacionalidad",
          label: "Nacionalidad",
          ownLabel: true,
          active: ff.nacionalidad.length > 0,
          clear: () => pf({ nacionalidad: [] }),
          node: (
            <MultiSelect label="Nacionalidad" placeholder="Cualquiera" value={ff.nacionalidad} onChange={(nacionalidad) => pf({ nacionalidad })} options={NATIONALITIES.map((k) => ({ value: k.id, label: k.label }))} />
          ),
        },
        {
          id: "anio",
          label: "Año (rango)",
          active: ff.desde != null || ff.hasta != null,
          clear: () => pf({ desde: null, hasta: null }),
          node: <YearRange desde={ff.desde} hasta={ff.hasta} onChange={(desde, hasta) => pf({ desde, hasta })} />,
        },
        {
          id: "presupuesto",
          label: "Presupuesto",
          active: ff.presupuestoMin != null || ff.presupuestoMax != null,
          clear: () => pf({ presupuestoMin: null, presupuestoMax: null }),
          node: (
            <div className="space-y-2">
              <Range label="Presupuesto" min={ff.presupuestoMin} max={ff.presupuestoMax} hints={["Mínimo", "Máximo"]} onChange={(presupuestoMin, presupuestoMax) => pf({ presupuestoMin, presupuestoMax })} />
              <select aria-label="Moneda" className="field" value={ff.moneda} onChange={(e) => pf({ moneda: e.target.value === "USD" ? "USD" : "GTQ" })}>
                <option value="GTQ">Quetzales (Q)</option>
                <option value="USD">Dólares (US$)</option>
              </select>
            </div>
          ),
        },
        {
          id: "dias",
          label: "Días de rodaje",
          active: ff.diasMin != null || ff.diasMax != null,
          clear: () => pf({ diasMin: null, diasMax: null }),
          node: <Range label="Días de rodaje" min={ff.diasMin} max={ff.diasMax} hints={["Mínimo", "Máximo"]} onChange={(diasMin, diasMax) => pf({ diasMin, diasMax })} />,
        },
        {
          id: "inversion",
          label: "Inversión local (Q)",
          active: ff.inversionMin != null || ff.inversionMax != null,
          clear: () => pf({ inversionMin: null, inversionMax: null }),
          node: <Range label="Inversión local" min={ff.inversionMin} max={ff.inversionMax} hints={["Mínimo", "Máximo"]} onChange={(inversionMin, inversionMax) => pf({ inversionMin, inversionMax })} />,
        },
        {
          id: "empleos",
          label: "Empleos",
          active: ff.empleosMin != null || ff.empleosMax != null,
          clear: () => pf({ empleosMin: null, empleosMax: null }),
          node: <Range label="Empleos" min={ff.empleosMin} max={ff.empleosMax} hints={["Mínimo", "Máximo"]} onChange={(empleosMin, empleosMax) => pf({ empleosMin, empleosMax })} />,
        },
        {
          id: "q",
          label: "Buscar",
          active: ff.q !== "",
          clear: () => pf({ q: "" }),
          node: <input aria-label="Buscar" className="field" placeholder="Título, director/a, productor/a o casa productora" value={ff.q} onChange={(e) => pf({ q: e.target.value })} />,
        },
      ];
    }
    const cats = [...new Set([...ORG_CATEGORIES[layer === "circulacion" ? "circulacion" : "industria"], ...p.extraCategories])];
    return [
      {
        id: "categoria",
        label: "Categoría",
        ownLabel: true,
        active: of.categoria.length > 0,
        clear: () => po({ categoria: [] }),
        node: <MultiSelect label="Categoría" placeholder="Todas" value={of.categoria} onChange={(categoria) => po({ categoria })} options={cats.map((c) => ({ value: c, label: c }))} />,
      },
      {
        id: "iniciativa",
        label: "Naturaleza",
        ownLabel: true,
        active: of.iniciativa.length > 0,
        clear: () => po({ iniciativa: [] }),
        node: <MultiSelect label="Naturaleza" placeholder="Cualquiera" value={of.iniciativa} onChange={(iniciativa) => po({ iniciativa })} options={INITIATIVE_TYPES.map((i) => ({ value: i.id, label: i.label }))} />,
      },
      {
        id: "q",
        label: "Buscar",
        active: of.q !== "",
        clear: () => po({ q: "" }),
        node: <input aria-label="Buscar" className="field" placeholder="Nombre, categoría o descripción" value={of.q} onChange={(e) => po({ q: e.target.value })} />,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilm, layer, ff, of, p.extraCategories, p.extraGenres, p.languages]);

  const hidden = p.hiddenFields ?? [];
  const offered = fields.filter((f) => !hidden.includes(f.id));
  const shownFields = offered.filter((f) => f.active || added.includes(f.id));
  const available = offered.filter((f) => !shownFields.includes(f));
  const n = activeFilterCount({ layer, filmFilter: ff, orgFilter: of });
  const clearAll = () => {
    if (isFilm) p.onFilm({ ...EMPTY_FILM_FILTER, locacion: ff.locacion });
    else p.onOrg({ ...EMPTY_ORG_FILTER });
    setAdded([]);
  };
  const remove = (f: Field) => {
    f.clear();
    setAdded((a) => a.filter((x) => x !== f.id));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const noun = isFilm ? (p.count === 1 ? "producción" : "producciones") : p.count === 1 ? "entidad" : "entidades";
  const highlighted = n > 0;

  return (
    <div ref={root} className="pointer-events-auto">
      <div
        className={cn(
          "glass flex items-center rounded-2xl border shadow-soft transition-colors",
          p.compact ? "relative h-11 w-11 shrink-0 justify-center" : "gap-1 p-1",
          highlighted ? "border-accent/60" : "border-line",
        )}
      >
        <button
          type="button"
          className={cn(
            "flex items-center rounded-xl text-sm font-medium text-ink outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/60",
            p.compact ? "h-full w-full justify-center" : "h-9 gap-2 px-3",
          )}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={p.compact ? (n > 0 ? `Filtros: ${n} activos` : "Filtros") : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal className={cn(p.compact ? "h-5 w-5" : "h-4 w-4", highlighted ? "text-accent" : "text-muted")} aria-hidden />
          {!p.compact && "Filtros"}
          {n > 0 && !p.compact && <span className="rounded-md bg-accent px-1.5 text-xs font-semibold leading-5 text-accent-ink">{n}</span>}
        </button>
        {p.compact && n > 0 && (
          <span className="pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums text-white" aria-hidden>
            {n}
          </span>
        )}
        {n > 0 && !p.compact && (
          <button
            type="button"
            className="btn-ghost h-9 w-9 !p-0"
            onClick={() => {
              clearAll();
            }}
            aria-label="Quitar todos los filtros"
            title="Quitar todos los filtros"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Filtros del mapa"
          className="glass absolute left-0 top-full z-30 mt-2 w-[min(440px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line shadow-float"
        >
          <div className="max-h-[min(62dvh,540px)] overflow-y-auto p-4">
            <section>
              <h3 className="label">Filtros</h3>
              {shownFields.length === 0 && !adding && <p className="mb-2 text-sm text-muted">Sin filtros: el mapa muestra todo. Añade uno para acotar lo que ves.</p>}
              <div className="space-y-3">
                {shownFields.map((f) => (
                  <div key={f.id} className="relative">
                    {!f.ownLabel && <div className="label pr-8">{f.label}</div>}
                    {f.node}
                    <button
                      type="button"
                      className={cn("btn-ghost absolute right-0 h-6 w-6 !p-0", f.ownLabel ? "top-0" : "-top-0.5")}
                      onClick={() => remove(f)}
                      aria-label={`Quitar el filtro «${f.label}»`}
                      title="Quitar este filtro"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {available.length > 0 && (
                <div className="mt-3">
                  {adding ? (
                    <div className="flex flex-wrap gap-1.5" role="menu" aria-label="Añadir filtro">
                      {available.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          role="menuitem"
                          className="chip transition-colors hover:border-accent hover:text-ink"
                          onClick={() => {
                            setAdded((a) => [...a, f.id]);
                            setAdding(false);
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button type="button" className="btn-outline h-9 gap-1.5 px-3 text-sm" onClick={() => setAdding(true)}>
                      <Plus className="h-4 w-4" /> Añadir filtro
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>

          <div className="border-t border-line bg-surface-2/60 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3 text-sm" aria-live="polite">
              <span>
                <b className="font-semibold tabular-nums">{fmtInt(p.count)}</b> {noun}
                {n > 0 && p.total > 0 ? <span className="text-muted"> de {fmtInt(p.total)}</span> : null}
              </span>
              {p.count === 0 && <span className="text-xs text-warn">Ningún registro coincide</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={clearAll} disabled={n === 0}>
                Limpiar todo
              </button>
              <button type="button" className="btn-ghost h-8 gap-1.5 px-2 text-xs" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Enlace copiado" : "Copiar enlace de esta vista"}
              </button>
              <Link href={p.downloadHref} className="btn-ghost ml-auto h-8 gap-1.5 px-2 text-xs">
                <Download className="h-3.5 w-3.5" /> Descargar estos datos
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
