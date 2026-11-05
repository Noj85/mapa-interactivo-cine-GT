"use client";

import { DatabaseZap, GitMerge, Link2, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Unlink2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createFestivalForOrgAction,
  deleteFestivalAction,
  linkFestivalOrgAction,
  mergeFestivalsAction,
  saveFestivalAction,
  seedFestivalsAction,
  syncCirculationAction,
  type SyncReport,
} from "@/app/admin/festivals";
import { FestivalPicker } from "@/components/records/FestivalPicker";
import type { Festival } from "@/lib/types";

interface Draft {
  id?: string;
  name: string;
  aliases: string;
  country: string;
  city: string;
  founded: string;
}

const toDraft = (f?: Festival): Draft => ({
  id: f?.id,
  name: f?.name ?? "",
  aliases: (f?.aliases ?? []).join("\n"),
  country: f?.country ?? "",
  city: f?.city ?? "",
  founded: f?.founded ? String(f.founded) : "",
});

interface OrgRef {
  id: string;
  name: string;
  status: "draft" | "published";
}
interface PendingOrg {
  id: string;
  name: string;
  candidates: { id: string; name: string }[];
}

const VIEWS = [
  { id: "", label: "Todos" },
  { id: "vinculados", label: "Vinculados" },
  { id: "sin-vincular", label: "Sin vincular" },
];

/** Catálogo de festivales: buscar, crear, editar, fusionar duplicados y cargar el catálogo base. */
export function FestivalsAdmin({
  rows,
  usage,
  total,
  all,
  q,
  page,
  pageSize,
  linkReady,
  links,
  orgs,
  pendingOrgs,
  view,
}: {
  rows: Festival[];
  usage: Record<string, number>;
  total: number;
  all: number;
  q: string;
  page: number;
  pageSize: number;
  /** false si todavía no se aplicó la migración 0010 */
  linkReady: boolean;
  /** festival -> entidad de Circulación */
  links: Record<string, string>;
  /** entidades de Circulación con categoría Festivales */
  orgs: OrgRef[];
  /** entidades Festivales sin entrada vinculada (con parecidos del catálogo) */
  pendingOrgs: PendingOrg[];
  view: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [search, setSearch] = useState(q);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [linkOrg, setLinkOrg] = useState("");
  const [report, setReport] = useState<SyncReport | null>(null);
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const taken = new Set(Object.values(links));

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ text: r.error, error: true });
      done?.();
      router.refresh();
    });
  };

  const save = () => {
    if (!edit) return;
    run(
      () =>
        saveFestivalAction({
          id: edit.id,
          name: edit.name,
          aliases: edit.aliases.split("\n").map((x) => x.trim()).filter(Boolean),
          country: edit.country,
          city: edit.city,
          founded: edit.founded,
        }),
      () => setEdit(null),
    );
  };

  const seed = () =>
    start(async () => {
      setMsg(null);
      const r = await seedFestivalsAction();
      if (!r.ok) return setMsg({ text: r.error, error: true });
      setMsg({ text: r.added ? `Se agregaron ${r.added} festivales del catálogo base.` : "El catálogo base ya estaba cargado." });
      router.refresh();
    });

  const sync = () =>
    start(async () => {
      setMsg(null);
      const r = await syncCirculationAction();
      if (!r.ok) return setMsg({ text: r.error, error: true });
      setReport(r.report);
      router.refresh();
    });

  const hrefFor = (o: { p?: number; v?: string }) => {
    const v = o.v ?? view;
    return `/admin/ajustes/festivales?${new URLSearchParams({ ...(q ? { q } : {}), ...(v ? { v } : {}), ...(o.p ? { p: String(o.p) } : {}) }).toString()}`;
  };
  const href = (p: number) => hrefFor({ p });

  return (
    <div>
      {all === 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1 text-muted">
            El catálogo está vacío. Carga el catálogo base (unos 3,300 festivales del mundo, de una base pública) para que el formulario pueda sugerirlos.
          </span>
          <button className="btn-primary !py-2 text-xs" disabled={pending} onClick={seed}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />} Cargar catálogo base
          </button>
        </div>
      )}

      {!linkReady && (
        <div className="mb-5 rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          Para vincular festivales con la capa Circulación aplica la migración <code>0010_festival_org_link.sql</code> en Supabase (después de 0007, 0008 y 0009).
        </div>
      )}

      {linkReady && (
        <section className="mb-5 rounded-2xl border border-line bg-surface p-4" aria-label="Vínculo con Circulación">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted">
              <b className="text-ink">Circulación.</b> {orgs.length} entidad{orgs.length === 1 ? "" : "es"} de categoría Festivales en el mapa
              {pendingOrgs.length > 0 ? `, ${pendingOrgs.length} sin entrada vinculada en este catálogo` : orgs.length ? ", todas vinculadas" : ""}. Las entidades nuevas se vinculan solas al guardarlas.
            </p>
            <button className="btn-ghost !py-2 text-xs" disabled={pending} onClick={sync} title="Vincula o crea la entrada del catálogo de cada entidad de Circulación con categoría Festivales">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sincronizar con Circulación
            </button>
          </div>
          {report && (
            <p role="status" className="mt-3 text-sm text-ok">
              Vinculados: {report.linked} · Creados: {report.created} · Ya estaban: {report.already}
              {report.review.length ? ` · Por revisar: ${report.review.length}` : ""}
              {report.conflicts.length ? ` · Con conflicto: ${report.conflicts.length}` : ""}
            </p>
          )}
          {report && report.conflicts.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-warn">
              {report.conflicts.map((c) => (
                <li key={c.orgId}>«{c.orgName}» tiene el mismo nombre que «{c.festivalName}», que ya está vinculado a otra entidad. ¿Está duplicada la entidad?</li>
              ))}
            </ul>
          )}
          {pendingOrgs.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs text-muted">Sin vincular. Si hay entradas parecidas, elige a cuál corresponde para no duplicar; si no, crea una nueva.</p>
              <ul className="space-y-2">
                {pendingOrgs.map((o) => (
                  <li key={o.id} className="rounded-xl border border-line bg-bg px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/entidades/${o.id}`} className="font-display hover:underline">{o.name}</Link>
                      <button className="btn-ghost ml-auto !min-h-0 !py-1 text-xs" disabled={pending} onClick={() => run(() => createFestivalForOrgAction(o.id))}>
                        <Plus className="h-3.5 w-3.5" /> Crear entrada nueva
                      </button>
                    </div>
                    {o.candidates.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>Parecidos:</span>
                        {o.candidates.map((c) => (
                          <button key={c.id} className="rounded-full border border-line px-2 py-0.5 hover:border-accent hover:text-ink" disabled={pending} onClick={() => run(() => linkFestivalOrgAction(c.id, o.id))}>
                            Vincular con «{c.name}»
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/ajustes/festivales" className="relative min-w-0 flex-1 sm:max-w-md" onSubmit={() => setSearch((s) => s.trim())}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          {view && <input type="hidden" name="v" value={view} />}
          <input className="field !pl-9" type="search" name="q" placeholder="Buscar por nombre o alias…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar festival" />
        </form>
        {linkReady && (
          <nav className="flex overflow-hidden rounded-xl border border-line text-xs" aria-label="Filtrar por vínculo">
            {VIEWS.map((v) => (
              <Link key={v.id} href={hrefFor({ v: v.id })} aria-current={view === v.id ? "true" : undefined} className={`px-3 py-2 ${view === v.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}>
                {v.label}
              </Link>
            ))}
          </nav>
        )}
        <span className="text-sm text-muted">{q || view ? `${total} coinciden · ` : ""}{all} en el catálogo</span>
        <span className="ml-auto flex gap-2">
          {all > 0 && (
            <button className="btn-ghost !py-2 text-xs" disabled={pending} onClick={seed} title="Agrega los del catálogo base que falten">
              <DatabaseZap className="h-3.5 w-3.5" /> Completar con catálogo base
            </button>
          )}
          <button className="btn-primary !py-2 text-xs" onClick={() => setEdit(toDraft())}>
            <Plus className="h-3.5 w-3.5" /> Nuevo festival
          </button>
        </span>
      </div>

      {msg && <p role="status" className={`mt-3 text-sm ${msg.error ? "text-danger" : "text-ok"}`}>{msg.text}</p>}

      {edit && (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base">{edit.id ? "Editar festival" : "Nuevo festival"}</h2>
            <button className="text-muted hover:text-ink" aria-label="Cerrar" onClick={() => setEdit(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="fa-name">Nombre *</label>
              <input id="fa-name" className="field" maxLength={300} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="fa-city">Ciudad</label>
              <input id="fa-city" className="field" maxLength={150} value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="fa-country">País</label>
              <input id="fa-country" className="field" maxLength={100} value={edit.country} onChange={(e) => setEdit({ ...edit, country: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="fa-year">Año de fundación</label>
              <input id="fa-year" className="field" inputMode="numeric" maxLength={4} value={edit.founded} onChange={(e) => setEdit({ ...edit, founded: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="fa-alias">Otros nombres (uno por línea)</label>
              <textarea id="fa-alias" className="field min-h-20" value={edit.aliases} onChange={(e) => setEdit({ ...edit, aliases: e.target.value })} placeholder={"Festival de Cannes\nCannes Film Festival"} />
              <p className="mt-1 text-xs text-muted">Sirven para encontrarlo al escribir, aunque la persona use otro nombre o idioma.</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button>
            <button className="btn-primary" disabled={pending || !edit.name.trim()} onClick={save}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          {q ? "Ningún festival coincide con la búsqueda." : "Todavía no hay festivales en el catálogo."}
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Festival</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Lugar</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Fundado</th>
                <th className="px-4 py-2.5 font-medium">Producciones</th>
                {linkReady && <th className="hidden px-4 py-2.5 font-medium md:table-cell">En el mapa</th>}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-display text-[15px]">{f.name}</div>
                    {f.aliases.length > 0 && <div className="mt-0.5 line-clamp-1 text-xs text-muted">También: {f.aliases.join(" · ")}</div>}
                    {linkId === f.id && (
                      <div className="mt-3 rounded-xl border border-line bg-bg p-3">
                        <p className="mb-2 text-xs text-muted">Elige la entidad de Circulación (categoría Festivales) que corresponde a <b className="text-ink">{f.name}</b>.</p>
                        <select className="field" aria-label="Entidad de Circulación" value={linkOrg} onChange={(e) => setLinkOrg(e.target.value)}>
                          <option value="">Elegir entidad…</option>
                          {orgs.filter((o) => !taken.has(o.id)).map((o) => (
                            <option key={o.id} value={o.id}>{o.name}{o.status === "draft" ? " (borrador)" : ""}</option>
                          ))}
                        </select>
                        {orgs.every((o) => taken.has(o.id)) && <p className="mt-1 text-xs text-muted">Todas las entidades de esa categoría ya están vinculadas.</p>}
                        <div className="mt-2 flex gap-2">
                          <button className="btn-primary !min-h-0 !py-1.5 text-xs" disabled={pending || !linkOrg} onClick={() => run(() => linkFestivalOrgAction(f.id, linkOrg), () => setLinkId(null))}>
                            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Vincular
                          </button>
                          <button className="btn-ghost !min-h-0 !py-1.5 text-xs" onClick={() => setLinkId(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                    {mergeId === f.id && (
                      <div className="mt-3 rounded-xl border border-line bg-bg p-3">
                        <p className="mb-2 text-xs text-muted">
                          Pasa todas las participaciones de <b className="text-ink">{f.name}</b> al festival que elijas. Este se elimina y su nombre queda como alias del otro.
                        </p>
                        <FestivalPicker
                          id={`merge-${f.id}`}
                          name={mergeInto.name}
                          festivalId={mergeInto.id}
                          onChange={(v) => setMergeInto({ id: v.festival_id, name: v.name })}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            className="btn-primary !min-h-0 !py-1.5 text-xs"
                            disabled={pending || !mergeInto.id || mergeInto.id === f.id}
                            onClick={() => run(() => mergeFestivalsAction(f.id, mergeInto.id!), () => setMergeId(null))}
                          >
                            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Fusionar
                          </button>
                          <button className="btn-ghost !min-h-0 !py-1.5 text-xs" onClick={() => setMergeId(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{[f.city, f.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="hidden px-4 py-2.5 text-muted md:table-cell">{f.founded ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{usage[f.id] ?? 0}</td>
                  {linkReady && (
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      {(() => {
                        const org = links[f.id] ? orgById.get(links[f.id]) : undefined;
                        if (!org) return <span className="text-xs text-muted">{links[f.id] ? "Entidad vinculada" : "Sin vincular"}</span>;
                        return (
                          <Link href={`/admin/entidades/${org.id}`} className="inline-flex max-w-[14rem] items-center gap-1.5 text-xs hover:underline" title={`Circulación: ${org.name}`}>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${org.status === "published" ? "bg-ok" : "bg-muted"}`} aria-hidden />
                            <span className="truncate">{org.name}</span>
                            <span className="text-muted">{org.status === "published" ? "· publicada" : "· borrador"}</span>
                          </Link>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !min-h-0 !p-1.5" aria-label={`Editar ${f.name}`} title="Editar" onClick={() => setEdit(toDraft(f))}><Pencil className="h-4 w-4" /></button>
                      {linkReady &&
                        (links[f.id] ? (
                          <button className="btn-ghost !min-h-0 !p-1.5" aria-label={`Desvincular ${f.name} de Circulación`} title="Desvincular de Circulación" disabled={pending} onClick={() => run(() => linkFestivalOrgAction(f.id, null))}>
                            <Unlink2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            className="btn-ghost !min-h-0 !p-1.5"
                            aria-label={`Vincular ${f.name} con Circulación`}
                            title="Vincular con una entidad de Circulación"
                            onClick={() => {
                              setLinkId(linkId === f.id ? null : f.id);
                              setLinkOrg("");
                            }}
                          >
                            <Link2 className="h-4 w-4" />
                          </button>
                        ))}
                      <button
                        className="btn-ghost !min-h-0 !p-1.5"
                        aria-label={`Fusionar ${f.name} con otro`}
                        title="Fusionar con otro festival"
                        onClick={() => {
                          setMergeId(mergeId === f.id ? null : f.id);
                          setMergeInto({ id: null, name: "" });
                        }}
                      >
                        <GitMerge className="h-4 w-4" />
                      </button>
                      <button
                        className="btn-ghost !min-h-0 !p-1.5 hover:!text-danger"
                        aria-label={`Eliminar ${f.name}`}
                        title="Eliminar"
                        disabled={pending}
                        onClick={() => {
                          const n = usage[f.id] ?? 0;
                          if (confirm(n ? `«${f.name}» tiene ${n} participaciones. Se conservarán como texto sin enlace al catálogo. ¿Eliminarlo?` : `¿Eliminar «${f.name}» del catálogo?`)) run(() => deleteFestivalAction(f.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > pageSize && (
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
              <span>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} de {total}</span>
              <span className="flex gap-3">
                {page > 0 && <Link className="text-accent hover:underline" href={href(page - 1)}>← Anteriores</Link>}
                {(page + 1) * pageSize < total && <Link className="text-accent hover:underline" href={href(page + 1)}>Siguientes →</Link>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
