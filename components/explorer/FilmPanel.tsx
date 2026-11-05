"use client";

import { AlertCircle, Award, ExternalLink, MapPin, MessageSquarePlus, Pencil } from "lucide-react";
import Link from "next/link";
import { filmTypeLabel } from "@/lib/film-types";
import { FESTIVAL_RESULTS, NATIONALITIES } from "@/lib/types";
import { fmtInt, fmtMoney } from "@/lib/utils";
import { CompletenessBadge, CompletenessMeter } from "@/components/ui/Badges";
import { PanelShell, type PanelCtx, SectionTitle, Stat } from "./parts";

export default function FilmPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, view, go, canEdit } = ctx;
  const film = data.films.find((f) => f.slug === view.film);
  if (!film)
    return (
      <PanelShell eyebrow="Producción" onBack={go.up} onClose={go.clear}>
        <p className="text-sm text-muted">No encontramos esta producción.</p>
      </PanelShell>
    );

  const kind = filmTypeLabel(film);
  const nat = NATIONALITIES.find((n) => n.id === film.nationality)?.label;
  const days = film.locations.reduce((s, l) => s + (l.days ?? 0), 0);
  const spend = film.locations.reduce((s, l) => s + (l.local_spend ?? 0), 0);
  const jobs = film.locations.reduce((s, l) => s + (l.jobs ?? 0), 0);
  const known = (k: "days" | "local_spend" | "jobs") => film.locations.some((l) => l[k] != null);
  const meta = [film.year, kind, nat].filter(Boolean).join(" · ");
  // Lo más reciente primero; los premios antes que las selecciones dentro de un mismo año.
  const rank = (r: string) => FESTIVAL_RESULTS.findIndex((x) => x.id === r);
  const fests = [...(film.festivals ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || rank(a.result) - rank(b.result));

  return (
    <PanelShell eyebrow="Producción" onBack={go.up} onClose={go.clear}>
      {film.poster_url && (
        <div className="mb-4 overflow-hidden rounded-lg border border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={film.poster_url} alt={`Póster de ${film.title}`} className="mx-auto max-h-[240px] sm:max-h-[360px] w-auto max-w-full object-contain" />
        </div>
      )}
      <h2 className="font-display text-[32px] leading-[1.05] tracking-tight text-ink">{film.title}</h2>
      <div className="mt-1.5 text-sm text-muted">{meta || "Datos básicos pendientes"}</div>
      {film.genres.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Géneros">
          {film.genres.map((g) => (
            <li key={g} className="chip">{g}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <CompletenessBadge pct={film.completeness} missing={film.missing_fields} />
        {film.status === "draft" && <span className="chip">Borrador</span>}
        {canEdit && (
          <Link href={`/admin/peliculas/${film.id}`} className="chip transition hover:border-accent hover:text-ink">
            <Pencil className="h-3 w-3" /> Editar
          </Link>
        )}
        {!canEdit && (
          <Link href={`/aportar?pelicula=${film.slug}`} className="chip transition hover:border-accent hover:text-ink">
            <MessageSquarePlus className="h-3 w-3" /> Sugerir corrección
          </Link>
        )}
      </div>

      {film.completeness < 100 && (
        <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 px-3.5 py-3">
          <div className="flex items-center gap-2 text-sm text-warn">
            <AlertCircle className="h-4 w-4 shrink-0" /> Información pendiente
          </div>
          <div className="mt-2">
            <CompletenessMeter pct={film.completeness} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Falta: {film.missing_fields.join(", ")}.
          </p>
        </div>
      )}

      {film.synopsis && <p className="mt-5 text-sm leading-relaxed text-ink/85">{film.synopsis}</p>}

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {film.director && (
          <>
            <dt className="text-muted">Director/a</dt>
            <dd className="text-ink">{film.director}</dd>
          </>
        )}
        {film.producer && (
          <>
            <dt className="text-muted">Productor/a</dt>
            <dd className="text-ink">{film.producer}</dd>
          </>
        )}
        {(film.companies ?? []).length > 0 && (
          <>
            <dt className="text-muted">{film.companies.length === 1 ? "Casa productora" : "Casas productoras"}</dt>
            <dd className="text-ink">
              {film.companies.map((c, i) => (
                <span key={i} className="block">
                  {c.name}
                  {c.country && <span className="text-muted"> · {c.country}</span>}
                </span>
              ))}
            </dd>
          </>
        )}
        {film.budget != null && (
          <>
            <dt className="text-muted">Presupuesto</dt>
            <dd className="text-ink">{fmtMoney(film.budget, film.currency)}</dd>
          </>
        )}
      </dl>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Stat label="Días" value={known("days") ? fmtInt(days) : "—"} />
        <Stat label="Inversión local" value={known("local_spend") ? fmtMoney(spend) : "—"} />
        <Stat label="Empleos" value={known("jobs") ? fmtInt(jobs) : "—"} />
      </div>

      <SectionTitle aside={`${film.locations.length}`}>Locaciones</SectionTitle>
      <ol className="space-y-1.5">
        {film.locations.map((l, i) => {
          const muni = gaz.muni(l.muni_ine);
          const depto = gaz.depto(l.depto_ine ?? muni?.depto_ine);
          return (
            <li key={l.id}>
              <button
                className="flex w-full items-start gap-3 rounded-2xl border border-line/60 px-3 py-2.5 text-left transition hover:border-accent/60 hover:bg-surface-2/60"
                onClick={() =>
                  go.place(
                    l.muni_ine != null
                      ? { type: "muni", code: l.muni_ine }
                      : l.depto_ine != null
                        ? { type: "depto", code: l.depto_ine }
                        : null,
                  )
                }
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{l.site ?? muni?.name ?? depto?.name ?? "Lugar por confirmar"}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <MapPin className="h-3 w-3" />
                    {[muni?.name, depto?.name].filter(Boolean).join(", ") || "Sin ubicación"}
                    {!muni && depto && <span className="text-warn"> · municipio por confirmar</span>}
                  </span>
                  <span className="mt-1 block text-xs text-muted/90">
                    {[
                      l.days != null && `${fmtInt(l.days)} días`,
                      l.local_spend != null && fmtMoney(l.local_spend),
                      l.jobs != null && `${fmtInt(l.jobs)} empleos`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sin cifras de rodaje"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {film.locations.length === 0 && <li className="text-sm text-muted">Sin lugar de rodaje registrado: aparece en la zona «Sin ubicación», fuera del territorio.</li>}
      </ol>

      {fests.length > 0 && (
        <>
          <SectionTitle aside={`${fests.length}`}>Festivales y premios</SectionTitle>
          <ul className="space-y-1.5">
            {fests.map((x) => {
              const result = FESTIVAL_RESULTS.find((r) => r.id === x.result)?.label;
              const where = [x.city, x.country].filter(Boolean).join(", ");
              // si el festival del catálogo está vinculado a una entidad publicada de Circulación, el nombre la abre
              const orgId = x.festival_id ? data.festivalOrgs?.[x.festival_id] : undefined;
              const org = orgId ? data.orgs.find((o) => o.id === orgId) : undefined;
              const external = x.url && /^https?:\/\//i.test(x.url) ? x.url : null;
              return (
                <li key={x.id} className="flex items-start gap-3 rounded-2xl border border-line/60 px-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                    <Award className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">
                      {org ? (
                        <>
                          <button className="text-left hover:text-accent hover:underline" onClick={() => go.org(org.slug)} title="Ver la entidad en el mapa">
                            {x.name}
                          </button>
                          {external && (
                            <a href={external} target="_blank" rel="noreferrer noopener" className="ml-1.5 inline-flex align-middle text-muted hover:text-accent" aria-label={`Sitio del festival ${x.name} (abre en otra pestaña)`}>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          )}
                        </>
                      ) : external ? (
                        <a href={external} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-accent hover:underline">
                          {x.name}
                          <ExternalLink className="h-3 w-3 shrink-0" aria-label="Abre en otra pestaña" />
                        </a>
                      ) : (
                        x.name
                      )}
                      {x.year != null && <span className="text-muted"> · {x.year}</span>}
                    </span>
                    <span className="block text-xs text-muted">{[result, x.section, x.award].filter(Boolean).join(" · ")}</span>
                    {where && <span className="block text-xs text-muted/80">{where}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PanelShell>
  );
}
