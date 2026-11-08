"use client";

import { categoriesText } from "@/lib/categories";
import { contactParts } from "@/lib/contact";
import { AlertCircle, AtSign, ExternalLink, Mail, MapPin, MessageSquarePlus, Pencil, Phone, Send } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { INITIATIVE_TYPES, LAYERS } from "@/lib/types";
import { CompletenessBadge, CompletenessMeter } from "@/components/ui/Badges";
import { OrgLogo, PanelShell, SectionTitle, type PanelCtx } from "./parts";
import { FESTIVAL_RESULTS } from "@/lib/types";

// solo se carga cuando alguien del equipo lo abre
const RequestInfoDialog = dynamic(() => import("@/components/admin/RequestInfoDialog").then((m) => m.RequestInfoDialog), { ssr: false });

const href = (w: string) => (/^https?:\/\//.test(w) ? w : `https://${w}`);

export default function OrgPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, view, go, canEdit } = ctx;
  const [asking, setAsking] = useState(false);
  const org = data.orgs.find((o) => o.slug === view.org);
  if (!org)
    return (
      <PanelShell eyebrow="Registro" onBack={go.up} onClose={go.clear}>
        <p className="text-sm text-muted">No encontramos este registro.</p>
      </PanelShell>
    );
  const muni = gaz.muni(org.muni_ine);
  const depto = gaz.depto(org.depto_ine ?? muni?.depto_ine);
  const type = INITIATIVE_TYPES.find((t) => t.id === org.initiative_type)?.label;
  const layer = LAYERS.find((l) => l.id === org.layer)!;

  // Producciones que participaron en este festival: las del mapa cuya participación apunta a una entrada del catálogo vinculada a esta entidad.
  const festivalIds = new Set(Object.entries(data.festivalOrgs ?? {}).filter(([, orgId]) => orgId === org.id).map(([id]) => id));
  const rank = (r: string) => FESTIVAL_RESULTS.findIndex((x) => x.id === r);
  const participations = festivalIds.size
    ? data.films
        .flatMap((film) => (film.festivals ?? []).filter((x) => x.festival_id && festivalIds.has(x.festival_id)).map((x) => ({ film, x })))
        .sort((a, b) => (b.x.year ?? 0) - (a.x.year ?? 0) || rank(a.x.result) - rank(b.x.result) || a.film.title.localeCompare(b.film.title))
    : [];

  return (
    <PanelShell eyebrow={`${layer.label} · ${categoriesText(org)}`} onBack={go.up} onClose={go.clear}>
      {org.logo_url && <OrgLogo org={org} full className="mb-4 h-24 w-24 rounded-2xl" />}
      <h2 className="font-display text-[30px] leading-[1.08] tracking-tight text-ink">{org.name}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {canEdit && <CompletenessBadge pct={org.completeness} missing={org.missing_fields} />}
        {type && <span className="chip">{type}</span>}
        {canEdit && (
          <Link href={`/admin/entidades/${org.id}`} className="chip transition hover:border-accent hover:text-ink">
            <Pencil className="h-3 w-3" /> Editar
          </Link>
        )}
        {canEdit && (
          <button type="button" onClick={() => setAsking(true)} className="chip transition hover:border-accent hover:text-ink">
            <Send className="h-3 w-3" /> Solicitar información
          </button>
        )}
        {!canEdit && (
          <Link href={`/aportar?entidad=${org.slug}`} className="chip transition hover:border-accent hover:text-ink">
            <MessageSquarePlus className="h-3 w-3" /> Sugerir corrección
          </Link>
        )}
      </div>

      {canEdit && org.completeness < 100 && (
        <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 px-3.5 py-3">
          <div className="flex items-center gap-2 text-sm text-warn">
            <AlertCircle className="h-4 w-4" /> Información pendiente
          </div>
          <div className="mt-2">
            <CompletenessMeter pct={org.completeness} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">Falta: {org.missing_fields.join(", ")}.</p>
        </div>
      )}

      {org.description && <p className="mt-5 text-sm leading-relaxed text-ink/85">{org.description}</p>}

      <div className="mt-5 space-y-2 text-sm">
        <button
          className="flex items-center gap-2 text-ink transition hover:text-accent"
          onClick={() =>
            go.place(
              org.muni_ine != null
                ? { type: "muni", code: org.muni_ine }
                : org.depto_ine != null
                  ? { type: "depto", code: org.depto_ine }
                  : null,
            )
          }
        >
          <MapPin className="h-4 w-4 text-muted" />
          {[org.city, muni?.name, depto?.name].filter((v, i, a) => v && a.indexOf(v) === i).join(", ") || "Locación pendiente"}
        </button>
        {org.web && (
          <a className="flex items-center gap-2 text-ink transition hover:text-accent" href={href(org.web)} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4 text-muted" /> {org.web}
          </a>
        )}
        {org.instagram && (
          <a
            className="flex items-center gap-2 text-ink transition hover:text-accent"
            href={`https://instagram.com/${org.instagram.replace(/^@/, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            <AtSign className="h-4 w-4 text-muted" /> {org.instagram}
          </a>
        )}
        {org.contact &&
          (() => {
            const c = contactParts(org.contact);
            if (!c.phone && !c.email) return <div className="text-muted">{org.contact}</div>;
            return (
              <>
                {c.phone && (
                  <a className="flex items-center gap-2 text-ink transition hover:text-accent" href={`tel:${c.phone.replace(/\s/g, "")}`}>
                    <Phone className="h-4 w-4 text-muted" /> {c.phone}
                  </a>
                )}
                {c.email && (
                  <a className="flex min-w-0 items-center gap-2 text-ink transition hover:text-accent" href={`mailto:${c.email}`}>
                    <Mail className="h-4 w-4 shrink-0 text-muted" /> <span className="truncate">{c.email}</span>
                  </a>
                )}
              </>
            );
          })()}
      </div>
      {participations.length > 0 && (
        <>
          <SectionTitle aside={`${participations.length}`}>Producciones que participaron</SectionTitle>
          <ul className="space-y-1.5">
            {participations.map(({ film, x }) => {
              const result = FESTIVAL_RESULTS.find((r) => r.id === x.result)?.label;
              return (
                <li key={x.id}>
                  <button className="w-full rounded-2xl border border-line/60 px-3 py-2.5 text-left transition hover:border-accent" onClick={() => go.film(film.slug)}>
                    <span className="block text-sm text-ink">
                      {film.title}
                      {x.year != null && <span className="text-muted"> · {x.year}</span>}
                    </span>
                    <span className="block text-xs text-muted">{[result, x.section, x.award].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {org.source && <p className="mt-6 text-xs text-muted/70">Fuente: {org.source}</p>}
      {asking &&
        createPortal(<RequestInfoDialog kind="org" targets={[{ id: org.id, title: org.name }]} onClose={() => setAsking(false)} />, document.body)}
    </PanelShell>
  );
}
