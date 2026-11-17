"use client";

import { AlertCircle, ExternalLink, MapPin, MessageSquarePlus, Pencil } from "lucide-react";
import Link from "next/link";
import { CompletenessBadge, CompletenessMeter } from "@/components/ui/Badges";
import { personDepto, personRoleLabels } from "@/lib/people";
import { PanelShell, PersonPhoto, type PanelCtx } from "./parts";

export default function PersonPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, view, go, canEdit } = ctx;
  const person = (data.people ?? []).find((p) => p.slug === view.person);
  if (!person)
    return (
      <PanelShell eyebrow="Persona" onBack={go.up} onClose={go.clear}>
        <p className="text-sm text-muted">No encontramos a esta persona.</p>
      </PanelShell>
    );

  const muni = gaz.muni(person.muni_ine);
  const depto = gaz.depto(personDepto(person));
  const roles = personRoleLabels(person);
  const placeLabel = [muni?.name, depto?.name].filter((v, i, a) => v && a.indexOf(v) === i).join(", ");

  return (
    <PanelShell eyebrow="Industria · Personas" onBack={go.up} onClose={go.clear}>
      <PersonPhoto person={person} full className="mb-4 h-24 w-24 rounded-2xl" />
      <h2 className="font-display text-[30px] leading-[1.08] tracking-tight text-ink">{person.name}</h2>
      {roles.length > 0 && <p className="mt-1 text-sm text-muted">{roles.join(" · ")}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {canEdit && <CompletenessBadge pct={person.completeness} missing={person.missing_fields} />}
        {canEdit && (
          <Link href={`/admin/personas/${person.id}`} className="chip transition hover:border-accent hover:text-ink">
            <Pencil className="h-3 w-3" /> Editar
          </Link>
        )}
        {!canEdit && (
          <Link href={`/aportar?persona=${person.slug}`} className="chip transition hover:border-accent hover:text-ink">
            <MessageSquarePlus className="h-3 w-3" /> Sugerir corrección
          </Link>
        )}
        <Link href={`/directorio/${person.slug}`} className="chip transition hover:border-accent hover:text-ink">
          <ExternalLink className="h-3 w-3" /> Ver ficha completa
        </Link>
      </div>

      {canEdit && person.completeness < 100 && (
        <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 px-3.5 py-3">
          <div className="flex items-center gap-2 text-sm text-warn">
            <AlertCircle className="h-4 w-4" /> Información pendiente
          </div>
          <div className="mt-2">
            <CompletenessMeter pct={person.completeness} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">Falta: {person.missing_fields.join(", ")}.</p>
        </div>
      )}

      {person.bio && <p className="mt-5 text-sm leading-relaxed text-ink/85">{person.bio}</p>}

      <div className="mt-5 space-y-2 text-sm">
        <button
          className="flex items-center gap-2 text-ink transition hover:text-accent"
          onClick={() =>
            go.place(
              person.muni_ine != null
                ? { type: "muni", code: person.muni_ine }
                : personDepto(person) != null
                  ? { type: "depto", code: personDepto(person)! }
                  : null,
            )
          }
        >
          <MapPin className="h-4 w-4 text-muted" />
          {placeLabel || "Ubicación pendiente"}
          {placeLabel ? <span className="text-xs text-muted">(aproximada)</span> : null}
        </button>
        {person.languages.length > 0 && <p className="text-muted">Idiomas: {person.languages.join(", ")}</p>}
      </div>
    </PanelShell>
  );
}
