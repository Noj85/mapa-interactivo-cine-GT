"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { personRoleLabels } from "@/lib/people";
import { cn, normalize } from "@/lib/utils";

export interface DirectoryPerson {
  slug: string;
  name: string;
  roles: string[];
  other_role: string | null;
  depto: string | null;
  depto_ine: number | null;
  photo_url: string | null;
}

export interface DirectoryOrg {
  slug: string;
  name: string;
  categories: string[];
  depto: string | null;
  depto_ine: number | null;
}

/** Buscador del directorio: técnicas y técnicos, y empresas de la industria. */
export function DirectoryBrowser({
  people,
  orgs,
  deptos,
  roleOptions,
  categoryOptions,
}: {
  people: DirectoryPerson[];
  orgs: DirectoryOrg[];
  deptos: { code: number; name: string }[];
  roleOptions: { id: string; label: string }[];
  categoryOptions: string[];
}) {
  const [tab, setTab] = useState<"personas" | "empresas">("personas");
  const [q, setQ] = useState("");
  const [depto, setDepto] = useState<number | "">("");
  const [oficio, setOficio] = useState("");
  const [categoria, setCategoria] = useState("");
  const nq = normalize(q);

  const shownPeople = useMemo(
    () =>
      people.filter((p) => {
        if (depto !== "" && p.depto_ine !== depto) return false;
        if (oficio && !p.roles.includes(oficio) && !(oficio === "otro" && p.other_role)) return false;
        if (!nq) return true;
        return normalize([p.name, ...personRoleLabels(p), p.depto].filter(Boolean).join(" ")).includes(nq);
      }),
    [people, depto, oficio, nq],
  );
  const shownOrgs = useMemo(
    () =>
      orgs.filter((o) => {
        if (depto !== "" && o.depto_ine !== depto) return false;
        if (categoria && !o.categories.includes(categoria)) return false;
        if (!nq) return true;
        return normalize([o.name, ...o.categories, o.depto].filter(Boolean).join(" ")).includes(nq);
      }),
    [orgs, depto, categoria, nq],
  );

  return (
    <div>
      <div role="tablist" aria-label="Directorio" className="inline-flex rounded-2xl border border-line bg-surface p-1">
        {(
          [
            ["personas", "Técnicas y técnicos", people.length],
            ["empresas", "Empresas", orgs.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("flex items-center gap-2 rounded-xl px-4 py-2 text-sm", tab === id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
          >
            {label}
            <span className="rounded-full bg-bg px-1.5 text-[11px] tabular-nums text-muted">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <input className="field" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select className="field" value={depto} onChange={(e) => setDepto(e.target.value ? Number(e.target.value) : "")} aria-label="Departamento">
          <option value="">Todo el país</option>
          {deptos.map((d) => (
            <option key={d.code} value={d.code}>{d.name}</option>
          ))}
        </select>
        {tab === "personas" ? (
          <select className="field" value={oficio} onChange={(e) => setOficio(e.target.value)} aria-label="Oficio">
            <option value="">Todos los oficios</option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        ) : (
          <select className="field" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {tab === "personas" ? (
        shownPeople.length === 0 ? (
          <p className="mt-8 text-sm text-muted">No hay personas con esos filtros.</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {shownPeople.map((p) => (
              <li key={p.slug}>
                <Link href={`/directorio/${p.slug}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-lg font-medium text-muted">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      p.name.slice(0, 1)
                    )}
                  </span>
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{personRoleLabels(p).join(" · ") || "Oficio por confirmar"}</span>
                    {p.depto && <span className="mt-1 block text-xs text-muted">{p.depto}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : shownOrgs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No hay empresas con esos filtros.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {shownOrgs.map((o) => (
            <li key={o.slug}>
              <Link href={`/directorio/empresa/${o.slug}`} className="block rounded-2xl border border-line bg-surface p-4 hover:border-accent">
                <span className="font-medium">{o.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{o.categories.join(" · ")}</span>
                {o.depto && <span className="mt-1 block text-xs text-muted">{o.depto}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
