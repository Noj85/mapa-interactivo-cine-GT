"use client";

import { DatabaseZap, GitMerge, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteFestivalAction, mergeFestivalsAction, saveFestivalAction, seedFestivalsAction } from "@/app/admin/festivals";
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

/** Catálogo de festivales: buscar, crear, editar, fusionar duplicados y cargar el catálogo base. */
export function FestivalsAdmin({
  rows,
  usage,
  total,
  all,
  q,
  page,
  pageSize,
}: {
  rows: Festival[];
  usage: Record<string, number>;
  total: number;
  all: number;
  q: string;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [search, setSearch] = useState(q);

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

  const href = (p: number) => `/admin/festivales?${new URLSearchParams({ ...(q ? { q } : {}), ...(p ? { p: String(p) } : {}) }).toString()}`;

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

      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/festivales" className="relative min-w-0 flex-1 sm:max-w-md" onSubmit={() => setSearch((s) => s.trim())}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="field !pl-9" type="search" name="q" placeholder="Buscar por nombre o alias…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar festival" />
        </form>
        <span className="text-sm text-muted">{q ? `${total} coinciden · ` : ""}{all} en el catálogo</span>
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
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-display text-[15px]">{f.name}</div>
                    {f.aliases.length > 0 && <div className="mt-0.5 line-clamp-1 text-xs text-muted">También: {f.aliases.join(" · ")}</div>}
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
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !min-h-0 !p-1.5" aria-label={`Editar ${f.name}`} title="Editar" onClick={() => setEdit(toDraft(f))}><Pencil className="h-4 w-4" /></button>
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
