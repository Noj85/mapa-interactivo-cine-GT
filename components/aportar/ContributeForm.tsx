"use client";

import { CheckCircle2, Clapperboard, Landmark, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { submitCollectedAction } from "@/app/completar/actions";
import { filmDraft, filmPayload, orgContactErrors, orgDraft, orgPayload, type FilmDraft, type OrgDraft } from "@/components/records/drafts";
import { FestivalsEditor } from "@/components/records/FestivalsEditor";
import { FilmFields } from "@/components/records/FilmFields";
import { ImageField } from "@/components/records/ImageField";
import { LocationsEditor } from "@/components/records/LocationsEditor";
import { OrgFields } from "@/components/records/OrgFields";
import { CompletenessMeter } from "@/components/ui/Badges";
import { filmCompleteness, orgCompleteness } from "@/lib/completeness";
import type { Film, Org } from "@/lib/types";
import { cn } from "@/lib/utils";

type Kind = "film" | "org";

/**
 * Formulario público para sugerir un registro nuevo o corregir uno existente.
 * Es la misma interfaz que usa el equipo en el panel (mismos campos, locaciones, póster y logo);
 * solo cambia lo de abajo: no hay publicar ni eliminar, y todo queda pendiente de revisión.
 */
export function ContributeForm({
  film,
  org,
  initialKind,
  collect,
}: {
  film?: Film;
  org?: Org;
  initialKind?: Kind;
  /** Enlace privado de una solicitud de información: el aporte llega como «recopilación». */
  collect?: { token: string; password: string };
}) {
  const correcting = !!(film || org);
  const [kind, setKind] = useState<Kind>(film ? "film" : org ? "org" : (initialKind ?? "film"));
  const opened = useRef(Date.now());
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState<FilmDraft>(() => filmDraft(film));
  const [o, setO] = useState<OrgDraft>(() => orgDraft(org));
  const setFilm = (patch: Partial<FilmDraft>) => setF((x) => ({ ...x, ...patch }));
  const setOrg = (patch: Partial<OrgDraft>) => setO((x) => ({ ...x, ...patch }));

  // ---- comunes
  const [note, setNote] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");

  const filmData = useMemo(() => filmPayload(f), [f]);
  const orgData = useMemo(() => orgPayload(o), [o]);

  const comp = useMemo(
    () =>
      kind === "film"
        ? filmCompleteness({
            title: f.title,
            year: filmData.year,
            kind: filmData.kind,
            director: filmData.director,
            producer: filmData.producer,
            nationality: filmData.nationality,
            budget: filmData.budget,
            currency: f.currency,
            synopsis: filmData.synopsis,
            companies: filmData.companies,
            locations: filmData.locations as never,
          })
        : orgCompleteness({
            name: o.name,
            category: o.categories[0] ?? "",
            initiative_type: orgData.initiative_type,
            depto_ine: o.depto_ine,
            muni_ine: o.muni_ine,
            lat: o.lat,
            lng: o.lng,
            web: orgData.web,
            instagram: orgData.instagram,
            contact: orgData.contact,
            description: orgData.description,
          }),
    [kind, f.title, f.currency, filmData, o.name, o.categories, o.depto_ine, o.muni_ine, o.lat, o.lng, orgData],
  );

  // con enlace de recopilación la fuente es el propio equipo; la nota es opcional
  const sourceOk = collect ? true : note.trim().length >= 8;
  const submitterOk = !collect || submitter.trim().length >= 3;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const contactOk = kind === "film" || orgContactErrors(o).ok;
  const recordOk = kind === "film" ? f.title.trim().length > 0 : o.name.trim().length > 0 && o.categories.length > 0;
  const ready = recordOk && contactOk && sourceOk && emailOk && submitterOk;
  const missingNow = [
    !recordOk ? (kind === "film" ? "el título" : "el nombre y al menos una categoría") : null,
    !contactOk ? "corregir el teléfono o correo de la entidad" : null,
    !sourceOk ? "la fuente" : null,
    !submitterOk ? "tu nombre y rol" : null,
    !emailOk ? "tu correo" : null,
  ].filter(Boolean);

  const send = async () => {
    setError(null);
    setStatus("sending");
    try {
      // las locaciones no llevan id: el equipo las reconstruye al revisar
      const data =
        kind === "film"
          ? {
              ...filmData,
              locations: filmData.locations.map(({ id: _id, ...l }) => l),
              festivals: filmData.festivals.map(({ id: _fid, ...x }) => x),
            }
          : orgData;
      if (collect) {
        const r = await submitCollectedAction({
          token: collect.token,
          password: collect.password,
          data,
          note: note.trim() || `Información aportada por el equipo de ${kind === "film" ? "la producción" : "la entidad"} (${submitter.trim()}), mediante enlace de recopilación.`,
          contact: email.trim(),
          submitter: submitter.trim(),
        });
        if (!r.ok) throw new Error(r.error);
        setStatus("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const res = await fetch("/api/aportes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          data,
          target_id: film?.id ?? org?.id ?? null,
          note: note.trim(),
          contact: email.trim(),
          website_url_hp: trap,
          opened_at: opened.current,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "No pudimos enviar tu aporte.");
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  };

  if (status === "done") {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-surface p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-ok" />
        <h2 className="mt-4 font-display text-3xl tracking-tight">¡Gracias por aportar!</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
          {collect
            ? <>Recibimos la información. El equipo de PROCINE y la Academia la revisará antes de publicarla. Si necesitamos aclarar algo, te escribiremos a <b>{email.trim()}</b>.</>
            : <>Tu aporte quedó pendiente. El equipo de la Academia lo verificará antes de que aparezca en el mapa; la revisión y aprobación puede tomar hasta tres días hábiles. Si necesitamos aclarar algo, te escribiremos a <b>{email.trim()}</b>.</>}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {collect ? (
            <button className="btn-primary" onClick={() => setStatus("idle")}>Seguir editando</button>
          ) : (
            <>
              <Link href="/" className="btn-primary">Volver al mapa</Link>
              <button className="btn-outline" onClick={() => window.location.assign("/aportar")}>Enviar otro aporte</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!correcting && (
        <div role="tablist" aria-label="Qué quieres aportar" className="inline-flex rounded-2xl border border-line bg-surface p-1">
          {([
            ["film", "Una producción", Clapperboard],
            ["org", "Una entidad", Landmark],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={kind === id}
              onClick={() => setKind(id)}
              className={cn("flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors", kind === id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}

      {correcting && !collect && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          Estás sugiriendo una corrección para <b>{film?.title ?? org?.name}</b>. Cambia lo que esté mal o complétalo; no se modifica nada hasta que el equipo lo revise.
        </div>
      )}
      {collect && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm leading-relaxed">
          Estás completando la información de <b>{film?.title ?? org?.name}</b> para el Mapa del Cine de Guatemala.
          {(film?.missing_fields ?? org?.missing_fields ?? []).length > 0 && (
            <>
              {" "}Nos falta o necesitamos confirmar: <b>{(film?.missing_fields ?? org?.missing_fields ?? []).join(", ")}</b>. Si algún dato no lo sabes, déjalo en blanco.
            </>
          )}{" "}
          Nada se publica hasta que el equipo de PROCINE lo revise.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:gap-10">
        <div className="space-y-8">
          {kind === "film" ? (
            <>
              <FilmFields draft={f} onChange={setFilm} />
              <LocationsEditor locs={f.locs} onChange={(locs) => setFilm({ locs })} />
              <FestivalsEditor fests={f.fests} onChange={(fests) => setFilm({ fests })} />
            </>
          ) : (
            <OrgFields draft={o} onChange={setOrg} />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-line bg-surface p-4">
            {kind === "film" ? (
              <ImageField key="poster" kind="poster" audience="public" value={f.poster} onChange={(poster) => setFilm({ poster })} />
            ) : (
              <ImageField key="logo" kind="logo" audience="public" value={o.logo} onChange={(logo) => setOrg({ logo })} />
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Opcional. Sube solo imágenes que puedas compartir; el equipo las revisa antes de publicarlas.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Completitud</span>
              <span className="font-display text-2xl">{comp.completeness}%</span>
            </div>
            <div className="mt-2"><CompletenessMeter pct={comp.completeness} /></div>
            {comp.missing.length > 0 && <p className="mt-3 text-xs leading-relaxed text-muted">Falta: {comp.missing.join(", ")}. Si no lo sabes, no pasa nada.</p>}
          </div>
        </aside>
      </div>

      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <div>
            {collect ? (
              <>
                <label className="label" htmlFor="c-submitter">Tu nombre y rol en {kind === "film" ? "la producción" : "la entidad"} *</label>
                <input id="c-submitter" className="field" required aria-required maxLength={200} placeholder="Ej. Ana López, productora" value={submitter} onChange={(e) => setSubmitter(e.target.value)} />
                <label className="label mt-4" htmlFor="c-note">Notas o fuentes (opcional)</label>
                <textarea id="c-note" className="field min-h-16" maxLength={1500} placeholder="Un enlace, un catálogo o algo que ayude a verificar los datos." value={note} onChange={(e) => setNote(e.target.value)} />
              </>
            ) : (
              <>
                <label className="label" htmlFor="c-note">Fuente de la información *</label>
                <textarea
                  id="c-note"
                  className="field min-h-20"
                  required
                  aria-required
                  placeholder="Un enlace, el catálogo donde la viste, o cómo lo sabes. El equipo la usa para verificar el dato."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1500}
                />
              </>
            )}
          </div>
          <div>
            <label className="label" htmlFor="c-mail">Tu correo *</label>
            <input id="c-mail" type="email" required aria-required autoComplete="email" className="field" placeholder="Para que el equipo te escriba si tiene dudas; no se publica." value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        {/* campo trampa contra robots: las personas no lo ven */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            No lo llenes
            <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={!ready || status === "sending"} onClick={send}>
            {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar aporte
          </button>
          <span className="text-xs text-muted">
            {missingNow.length ? `Falta ${missingNow.join(", ")}.` : "El equipo lo revisa antes de publicarlo."}
          </span>
        </div>
      </section>
    </div>
  );
}
