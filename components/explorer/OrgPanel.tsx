"use client";

import { categoriesText } from "@/lib/categories";
import { contactParts } from "@/lib/contact";
import { AlertCircle, AtSign, ExternalLink, Mail, MapPin, MessageSquarePlus, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { INITIATIVE_TYPES, LAYERS } from "@/lib/types";
import { CompletenessBadge, CompletenessMeter } from "@/components/ui/Badges";
import { OrgLogo, PanelShell, type PanelCtx } from "./parts";

const href = (w: string) => (/^https?:\/\//.test(w) ? w : `https://${w}`);

export default function OrgPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, view, go, canEdit } = ctx;
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

  return (
    <PanelShell eyebrow={`${layer.label} · ${categoriesText(org)}`} onBack={go.up} onClose={go.clear}>
      {org.logo_url && <OrgLogo org={org} full className="mb-4 h-24 w-24 rounded-2xl" />}
      <h2 className="font-display text-[30px] leading-[1.08] tracking-tight text-ink">{org.name}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <CompletenessBadge pct={org.completeness} missing={org.missing_fields} />
        {type && <span className="chip">{type}</span>}
        {canEdit && (
          <Link href={`/admin/entidades/${org.id}`} className="chip transition hover:border-accent hover:text-ink">
            <Pencil className="h-3 w-3" /> Editar
          </Link>
        )}
        {!canEdit && (
          <Link href={`/aportar?entidad=${org.slug}`} className="chip transition hover:border-accent hover:text-ink">
            <MessageSquarePlus className="h-3 w-3" /> Sugerir corrección
          </Link>
        )}
      </div>

      {org.completeness < 100 && (
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
          {[org.city, muni?.name, depto?.name].filter((v, i, a) => v && a.indexOf(v) === i).join(", ") || "Ubicación pendiente"}
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
      {org.source && <p className="mt-6 text-xs text-muted/70">Fuente: {org.source}</p>}
    </PanelShell>
  );
}
