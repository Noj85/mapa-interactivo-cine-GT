"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteOrgAction, saveOrgAction } from "@/app/admin/actions";
import { orgContactErrors, orgDraft, orgPayload, type OrgDraft, type OrgLayerId } from "@/components/records/drafts";
import { ImageField } from "@/components/records/ImageField";
import { OrgFields } from "@/components/records/OrgFields";
import { CompletenessMeter } from "@/components/ui/Badges";
import { orgCompleteness } from "@/lib/completeness";
import type { Org } from "@/lib/types";

export function OrgEditor({ org, defaultLayer = "circulacion" }: { org?: Org; defaultLayer?: OrgLayerId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [d, setD] = useState<OrgDraft>(() => orgDraft(org, defaultLayer));
  const [publish, setPublish] = useState(org ? org.status === "published" : true);
  const set = (patch: Partial<OrgDraft>) => setD((x) => ({ ...x, ...patch }));

  const data = useMemo(() => orgPayload(d), [d]);
  const payload = useMemo(
    () => ({ ...data, id: org?.id, status: publish ? ("published" as const) : ("draft" as const) }),
    [data, org?.id, publish],
  );

  const comp = useMemo(
    () =>
      orgCompleteness({
        name: d.name,
        category: d.categories[0] ?? "",
        initiative_type: data.initiative_type,
        depto_ine: d.depto_ine,
        muni_ine: d.muni_ine,
        lat: d.lat,
        lng: d.lng,
        web: data.web,
        instagram: data.instagram,
        contact: data.contact,
        description: data.description,
      }),
    [data, d.name, d.categories, d.depto_ine, d.muni_ine, d.lat, d.lng],
  );

  const submit = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await saveOrgAction(payload);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      if (!org) router.replace(`/admin/entidades/${res.id}`);
      else router.refresh();
    });
  };

  const remove = () => {
    if (!org || !confirm(`¿Eliminar “${org.name}”?`)) return;
    start(async () => {
      const res = await deleteOrgAction(org.id);
      if (res.ok) router.replace("/admin/entidades");
      else setError(res.error);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <OrgFields draft={d} onChange={set} />

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <ImageField kind="logo" value={d.logo} onChange={(logo) => set({ logo })} />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Completitud</span>
            <span className="font-display text-2xl">{comp.completeness}%</span>
          </div>
          <div className="mt-2"><CompletenessMeter pct={comp.completeness} /></div>
          {comp.missing.length > 0 && <p className="mt-3 text-xs leading-relaxed text-muted">Falta: {comp.missing.join(", ")}.</p>}
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 accent-[rgb(var(--accent))]" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <span>
              Publicar en el mapa
              <span className="block text-xs text-muted">
                {comp.publishable ? (comp.completeness < 100 ? "Se verá marcada como incompleta." : "Lista para publicar.") : "Necesita nombre, categoría y lugar; se guardará como borrador."}
              </span>
            </span>
          </label>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          {saved && !error && <p className="mt-3 text-sm text-ok">Guardado.</p>}
          <button className="btn-primary mt-4 w-full" disabled={pending || !d.name.trim() || d.categories.length === 0 || !orgContactErrors(d).ok} onClick={submit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
          {org && (
            <button className="btn-ghost mt-2 w-full text-danger hover:!text-danger" disabled={pending} onClick={remove}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
