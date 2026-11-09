"use client";

import { Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deletePersonAction, savePersonAction } from "@/app/admin/actions";
import { personDraft, personEmailError, personPayload, type PersonDraft } from "@/components/records/drafts";
import { ImageField } from "@/components/records/ImageField";
import { PersonFields } from "@/components/records/PersonFields";
import { CompletenessMeter } from "@/components/ui/Badges";
import { personCompleteness } from "@/lib/completeness";
import type { Person } from "@/lib/types";

/** Alta y edición de una persona del directorio. */
export function PersonEditor({ person, duplicates = [] }: { person?: Person; duplicates?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [d, setD] = useState<PersonDraft>(() => personDraft(person));
  const [publish, setPublish] = useState(person ? person.status === "published" : false);
  const set = (patch: Partial<PersonDraft>) => setD((x) => ({ ...x, ...patch }));

  const data = useMemo(() => personPayload(d), [d]);
  const mailError = personEmailError(d);
  const comp = useMemo(
    () =>
      personCompleteness({
        name: d.name,
        roles: data.roles,
        other_role: data.other_role,
        depto_ine: d.depto_ine,
        muni_ine: d.muni_ine,
        languages: data.languages,
        bio: data.bio,
        web: data.web,
        instagram: data.instagram,
        public_email: data.public_email,
        public_phone: data.public_phone,
        credits: data.credits,
      }),
    [d.name, d.depto_ine, d.muni_ine, data],
  );

  const submit = () => {
    setError(null);
    setSaved(false);
    if (mailError) return setError(mailError);
    start(async () => {
      const res = await savePersonAction({ ...data, id: person?.id, status: publish ? "published" : "draft" });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      if (!person) router.replace(`/admin/personas/${res.id}`);
      else router.refresh();
    });
  };

  const remove = () => {
    if (!person || !confirm(`¿Eliminar “${person.name}”?`)) return;
    start(async () => {
      const res = await deletePersonAction(person.id);
      if (res.ok) router.replace("/admin/personas");
      else setError(res.error);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {duplicates.length > 0 && (
          <div className="rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
            Ya hay {duplicates.length === 1 ? "otra persona" : "otras personas"} con este nombre:{" "}
            {duplicates.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link className="text-accent hover:underline" href={`/admin/personas/${p.id}`}>{p.name}</Link>
              </span>
            ))}
            .
          </div>
        )}
        <PersonFields draft={d} onChange={set} />
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <ImageField kind="poster" value={d.photo} onChange={(photo) => set({ photo })} />
          <p className="mt-2 text-[11px] leading-relaxed text-muted">Foto opcional. Se publica en el directorio.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Completitud</span>
            <span className="font-display text-2xl">{comp.completeness}%</span>
          </div>
          <div className="mt-2"><CompletenessMeter pct={comp.completeness} /></div>
          {comp.missing.length > 0 && <p className="mt-3 text-xs leading-relaxed text-muted">Falta: {comp.missing.join(", ")}.</p>}
          {!comp.publishable && <p className="mt-2 text-xs text-warn">Hace falta el nombre y al menos un oficio para publicar.</p>}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publicar en el directorio
          </label>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          {saved && <p className="mt-3 text-sm text-ok">Guardado.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
            </button>
            {person && (
              <button className="btn-ghost text-danger" disabled={pending} onClick={remove}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
