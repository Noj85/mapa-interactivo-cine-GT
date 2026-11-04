"use client";

import { Check, Clapperboard, Copy, Download, FileSpreadsheet, FileText, Landmark, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MultiSelect } from "@/components/ui/MultiSelect";
import {
  EMPTY_FILM_FILTER,
  EMPTY_ORG_FILTER,
  ORG_CATEGORIES,
  describeFilmFilter,
  describeOrgFilter,
  filmFilterActive,
  filmFilterToParams,
  filterFilms,
  filterOrgs,
  locationsMatching,
  orgFilterActive,
  orgFilterToParams,
  parseFilmFilter,
  parseOrgFilter,
  type ExportFormat,
  type ExportKind,
  type FilmFilter,
  type OrgFilter,
} from "@/lib/filters";
import { FILM_KINDS, INITIATIVE_TYPES, NATIONALITIES, type Film, type Org } from "@/lib/types";
import { cn, fmtInt } from "@/lib/utils";

interface Props {
  films: Film[];
  orgs: Org[];
  deptos: { code: number; name: string }[];
  names: Record<string, string>;
  initialQuery: string;
}

const KINDS: { id: ExportKind; title: string; blurb: string; icon: typeof Clapperboard }[] = [
  { id: "peliculas", title: "Películas", blurb: "Una fila por película, con sus datos y totales de rodaje.", icon: Clapperboard },
  { id: "locaciones", title: "Locaciones", blurb: "Una fila por lugar de rodaje, con coordenadas y cifras locales.", icon: MapPin },
  { id: "entidades", title: "Entidades", blurb: "Festivales, salas, productoras, escuelas y servicios.", icon: Landmark },
];

const digits = (s: string) => s.replace(/[^\d]/g, "");
const group = (s: string) => (s ? Number(s).toLocaleString("es-GT") : "");

export function DownloadsBuilder({ films, orgs, deptos, names, initialQuery }: Props) {
  const init = useMemo(() => new URLSearchParams(initialQuery), [initialQuery]);
  const [tipo, setTipo] = useState<ExportKind>(() => {
    const t = init.get("tipo");
    return t === "locaciones" || t === "entidades" ? t : "peliculas";
  });
  const [formato, setFormato] = useState<ExportFormat>(() => (init.get("formato") === "xlsx" ? "xlsx" : "csv"));
  const [ff, setFf] = useState<FilmFilter>(() => parseFilmFilter(init));
  const [of, setOf] = useState<OrgFilter>(() => parseOrgFilter(init));
  const [copied, setCopied] = useState(false);

  const deptoName = (c: number) => names[`depto:${c}`] ?? String(c);
  const muniName = (c: number) => names[`muni:${c}`] ?? String(c);

  const filmsHit = useMemo(() => filterFilms(films, ff), [films, ff]);
  const orgsHit = useMemo(() => filterOrgs(orgs, of), [orgs, of]);

  const locCount = useMemo(
    () => filmsHit.reduce((n, f) => n + (f.locations.length ? locationsMatching(f.locations, ff).length : 1), 0),
    [filmsHit, ff],
  );

  const count = tipo === "peliculas" ? filmsHit.length : tipo === "locaciones" ? locCount : orgsHit.length;
  const total = tipo === "entidades" ? orgs.length : films.length;
  const noun = tipo === "peliculas" ? ["película", "películas"] : tipo === "locaciones" ? ["locación", "locaciones"] : ["entidad", "entidades"];

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("tipo", tipo);
    if (formato !== "csv") p.set("formato", formato);
    if (tipo === "entidades") orgFilterToParams(of, p);
    else filmFilterToParams(ff, p);
    return p.toString();
  }, [tipo, formato, ff, of]);

  // La dirección de la página refleja los filtros: se puede copiar y compartir.
  useEffect(() => {
    window.history.replaceState(null, "", `/descargas?${query}`);
  }, [query]);

  const href = `/api/export?${query}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const patchFilm = (p: Partial<FilmFilter>) => setFf((f) => ({ ...f, ...p }));
  const patchOrg = (p: Partial<OrgFilter>) => setOf((f) => ({ ...f, ...p }));

  const chips = tipo === "entidades" ? describeOrgFilter(of, deptoName) : describeFilmFilter(ff, deptoName, muniName);
  const active = tipo === "entidades" ? orgFilterActive(of) : filmFilterActive(ff);
  const clear = () => (tipo === "entidades" ? setOf(EMPTY_ORG_FILTER) : setFf(EMPTY_FILM_FILTER));
  const deptoOptions = deptos.map((d) => ({ value: d.code, label: d.name }));

  const presets: { label: string; apply(): void }[] =
    tipo === "entidades"
      ? [
          { label: "Festivales", apply: () => setOf({ ...EMPTY_ORG_FILTER, capa: "circulacion", categoria: ["Festivales"] }) },
          { label: "Salas y cine clubs", apply: () => setOf({ ...EMPTY_ORG_FILTER, capa: "circulacion", categoria: ["Salas de cine comerciales y cadenas", "Cine clubs", "Espacios de exhibición"] }) },
          { label: "Productoras", apply: () => setOf({ ...EMPTY_ORG_FILTER, capa: "industria", categoria: ["Productoras"] }) },
          { label: "Formación", apply: () => setOf({ ...EMPTY_ORG_FILTER, capa: "industria", categoria: ["Formación"] }) },
        ]
      : [
          { label: "Ficción", apply: () => setFf({ ...EMPTY_FILM_FILTER, clase: ["ficcion"] }) },
          { label: "Documentales", apply: () => setFf({ ...EMPTY_FILM_FILTER, clase: ["documental"] }) },
          { label: "Guatemaltecas desde 2010", apply: () => setFf({ ...EMPTY_FILM_FILTER, nacionalidad: ["guatemalteca"], desde: 2010 }) },
          { label: "Con presupuesto declarado", apply: () => setFf({ ...EMPTY_FILM_FILTER, presupuestoMin: 1 }) },
        ];

  const sample = tipo === "entidades" ? orgsHit.slice(0, 6) : filmsHit.slice(0, 6);
  const empty = films.length + orgs.length === 0;
  const canDownload = count > 0;

  return (
    <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
        {/* 1 · qué quieres */}
        <section aria-labelledby="paso-1">
          <h2 id="paso-1" className="mb-3 flex items-center gap-2.5 text-sm font-semibold">
            <Step n={1} /> ¿Qué quieres descargar?
          </h2>
          <div role="radiogroup" aria-labelledby="paso-1" className="grid gap-3 sm:grid-cols-3">
            {KINDS.map((k) => {
              const on = tipo === k.id;
              return (
                <button
                  key={k.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTipo(k.id)}
                  className={cn(
                    "flex flex-col items-start justify-start rounded-lg border p-4 text-left transition-colors",
                    on ? "border-accent bg-accent/[0.07] ring-1 ring-accent" : "border-line bg-surface hover:border-muted/60",
                  )}
                >
                  <k.icon className={cn("h-5 w-5", on ? "text-accent" : "text-muted")} strokeWidth={1.75} />
                  <div className="mt-3 font-display text-lg font-semibold leading-tight">{k.title}</div>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{k.blurb}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2 · filtros */}
        <section aria-labelledby="paso-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="paso-2" className="flex items-center gap-2.5 text-sm font-semibold">
              <Step n={2} /> Filtra lo que necesitas <span className="font-normal text-muted">(opcional)</span>
            </h2>
            {active && (
              <button className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline" onClick={clear}>
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Atajos:</span>
            {presets.map((p) => (
              <button key={p.label} className="chip transition-colors hover:border-accent hover:text-ink" onClick={p.apply}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            {tipo === "entidades" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="f-capa">Capa</label>
                  <select
                    id="f-capa"
                    className="field"
                    value={of.capa ?? ""}
                    onChange={(e) => patchOrg({ capa: (e.target.value || null) as OrgFilter["capa"], categoria: [] })}
                  >
                    <option value="">Circulación e industria</option>
                    <option value="circulacion">Circulación</option>
                    <option value="industria">Industria</option>
                  </select>
                </div>
                <MultiSelect
                  label="Categoría"
                  placeholder="Todas"
                  value={of.categoria}
                  onChange={(categoria) => patchOrg({ categoria })}
                  options={(of.capa ? [...ORG_CATEGORIES[of.capa]] : [...ORG_CATEGORIES.circulacion, ...ORG_CATEGORIES.industria]).map((c) => ({ value: c, label: c }))}
                />
                <MultiSelect label="Departamento" placeholder="Todo el país" value={of.depto} onChange={(depto) => patchOrg({ depto })} options={deptoOptions} searchable />
                <MultiSelect
                  label="Naturaleza"
                  placeholder="Cualquiera"
                  value={of.iniciativa}
                  onChange={(iniciativa) => patchOrg({ iniciativa })}
                  options={INITIATIVE_TYPES.map((i) => ({ value: i.id, label: i.label }))}
                />
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="f-q-org">Buscar por nombre</label>
                  <input id="f-q-org" className="field" placeholder="Nombre, categoría o descripción" value={of.q} onChange={(e) => patchOrg({ q: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <MultiSelect label="Departamento de rodaje" placeholder="Todo el país" value={ff.depto} onChange={(depto) => patchFilm({ depto })} options={deptoOptions} searchable />
                <MultiSelect
                  label="Tipo de obra"
                  placeholder="Todos"
                  value={ff.clase}
                  onChange={(clase) => patchFilm({ clase })}
                  options={FILM_KINDS.map((k) => ({ value: k.id, label: k.label }))}
                />
                <MultiSelect
                  label="Nacionalidad"
                  placeholder="Cualquiera"
                  value={ff.nacionalidad}
                  onChange={(nacionalidad) => patchFilm({ nacionalidad })}
                  options={NATIONALITIES.map((k) => ({ value: k.id, label: k.label }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="f-desde">Año desde</label>
                    <input id="f-desde" className="field" inputMode="numeric" placeholder="1950" maxLength={4} value={ff.desde ?? ""} onChange={(e) => patchFilm({ desde: digits(e.target.value) ? Number(digits(e.target.value)) : null })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="f-hasta">Año hasta</label>
                    <input id="f-hasta" className="field" inputMode="numeric" placeholder="2025" maxLength={4} value={ff.hasta ?? ""} onChange={(e) => patchFilm({ hasta: digits(e.target.value) ? Number(digits(e.target.value)) : null })} />
                  </div>
                </div>

                <fieldset className="min-w-0 sm:col-span-2">
                  <legend className="label">Presupuesto</legend>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_130px]">
                    <input aria-label="Presupuesto mínimo" className="field" inputMode="numeric" placeholder="Mínimo, por ejemplo 500,000" value={group(ff.presupuestoMin != null ? String(ff.presupuestoMin) : "")} onChange={(e) => patchFilm({ presupuestoMin: digits(e.target.value) ? Number(digits(e.target.value)) : null })} />
                    <input aria-label="Presupuesto máximo" className="field" inputMode="numeric" placeholder="Máximo" value={group(ff.presupuestoMax != null ? String(ff.presupuestoMax) : "")} onChange={(e) => patchFilm({ presupuestoMax: digits(e.target.value) ? Number(digits(e.target.value)) : null })} />
                    <select aria-label="Moneda" className="field" value={ff.moneda} onChange={(e) => patchFilm({ moneda: e.target.value === "USD" ? "USD" : "GTQ" })}>
                      <option value="GTQ">Quetzales (Q)</option>
                      <option value="USD">Dólares (US$)</option>
                    </select>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">Solo salen las películas con presupuesto registrado. Si están en otra moneda se comparan con un cambio de referencia de Q 7.70 por dólar.</p>
                </fieldset>

                <div className="sm:col-span-2">
                  <label className="label" htmlFor="f-q">Buscar</label>
                  <input id="f-q" className="field" placeholder="Título, dirección o productora" value={ff.q} onChange={(e) => patchFilm({ q: e.target.value })} />
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={ff.soloCompletas} onChange={(e) => patchFilm({ soloCompletas: e.target.checked })} />
                  Solo películas con todas sus locaciones ubicadas en un municipio
                </label>
              </div>
            )}
          </div>

          {/* vista previa */}
          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
              Vista previa
              <span className="font-normal normal-case tracking-normal">
                {count > sample.length ? `Primeras ${sample.length} de ${fmtInt(count)}` : `${fmtInt(count)} en total`}
              </span>
            </div>
            {sample.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{total === 0 ? "Todavía no hay datos publicados." : "Ningún registro coincide con estos filtros."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {tipo === "entidades"
                  ? (sample as Org[]).map((o) => (
                      <li key={o.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                        <span className="min-w-0 truncate font-medium">{o.name}</span>
                        <span className="shrink-0 text-xs text-muted">{o.category}</span>
                      </li>
                    ))
                  : (sample as Film[]).map((f) => (
                      <li key={f.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                        <span className="min-w-0 truncate font-medium">{f.title}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {[f.year, FILM_KINDS.find((k) => k.id === f.kind)?.label, f.budget != null ? `${f.currency === "USD" ? "US$" : "Q"} ${fmtInt(f.budget)}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 3 · resultado */}
      <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="paso-3">
        <div className="rounded-lg border border-line bg-surface p-5 shadow-soft">
          <h2 id="paso-3" className="flex items-center gap-2.5 text-sm font-semibold">
            <Step n={3} /> Descarga
          </h2>
          <div className="mt-4 flex items-baseline gap-2" aria-live="polite">
            <span className="font-display text-5xl font-semibold tabular-nums tracking-tight">{fmtInt(count)}</span>
            <span className="text-sm text-muted">
              {count === 1 ? noun[0] : noun[1]}
              {active && total > 0 ? ` de ${fmtInt(total)}` : ""}
            </span>
          </div>

          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <li key={c} className="chip !rounded-md bg-surface-2 text-ink">
                  {c}
                </li>
              ))}
            </ul>
          )}

          <div role="radiogroup" aria-label="Formato" className="mt-5 grid grid-cols-2 gap-2">
            {(
              [
                { id: "csv", label: "CSV", icon: FileText, hint: "Universal" },
                { id: "xlsx", label: "Excel", icon: FileSpreadsheet, hint: ".xlsx" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={formato === f.id}
                onClick={() => setFormato(f.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  formato === f.id ? "border-accent bg-accent/[0.07] ring-1 ring-accent" : "border-line hover:border-muted/60",
                )}
              >
                <f.icon className="h-4 w-4 text-muted" />
                <span className="font-medium">{f.label}</span>
                <span className="ml-auto text-xs text-muted">{f.hint}</span>
              </button>
            ))}
          </div>

          {canDownload ? (
            <a href={href} download className="btn-primary mt-4 w-full">
              <Download className="h-4 w-4" /> Descargar {formato === "xlsx" ? "Excel" : "CSV"}
            </a>
          ) : (
            <button className="btn-primary mt-4 w-full" disabled>
              <Download className="h-4 w-4" /> Descargar
            </button>
          )}
          {empty && <p className="mt-2 text-xs text-muted">Todavía no hay datos publicados; las descargas se activarán con la primera carga.</p>}
          {!empty && count === 0 && <p className="mt-2 text-xs text-muted">Ajusta los filtros: ahora mismo no coincide ningún registro.</p>}

          <button onClick={copy} className="btn-ghost mt-2 w-full text-[13px]">
            {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />} {copied ? "Enlace copiado" : "Copiar enlace de descarga"}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            El enlace vuelve a generar el archivo con los datos del momento: sirve para reportes que se actualizan solos (Excel, Power Query, Google Sheets).
          </p>
        </div>
      </aside>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-ink">{n}</span>;
}
