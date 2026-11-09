import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportSubmissionReview, type CargaOption } from "@/components/admin/ImportSubmissionReview";
import { SubmissionReview } from "@/components/admin/SubmissionReview";
import { PosterImage } from "@/components/ui/PosterImage";
import { adminStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { posterThumb } from "@/lib/poster-url";
import { planFilmUpdate, planOrgUpdate } from "@/lib/import/diff";
import { filmSchema, orgSchema } from "@/lib/schemas";
import { decimalRoundNotes, diffSubmission } from "@/lib/submissions";
import { planCorrection } from "@/lib/submissions-plan";
import type { Film, FilmInput, Org, OrgInput, Person, SubmissionKind } from "@/lib/types";
import { cn, normalize } from "@/lib/utils";

const kindLabel = (k: SubmissionKind) => (k === "film" ? "Producción" : k === "person" ? "Persona" : "Entidad");

function ImageBox({ url, kind, alt }: { url: string; kind: SubmissionKind; alt: string }) {
  if (kind === "film" || kind === "person") return <PosterImage src={url} alt={alt} heightClass="h-48" maxWidthClass="max-w-[20rem]" className="rounded-lg border border-line bg-surface-2" />;
  return (
    <div className="h-32 w-32 overflow-hidden rounded-lg border border-line bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={posterThumb(url) ?? url} alt={alt} className="h-full w-full object-contain p-2" />
    </div>
  );
}

export default async function AporteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await adminStore();
  const sub = await store.getSubmission(id);
  if (!sub) notFound();
  const [gaz, current, people] = await Promise.all([
    serverGazetteer(),
    sub.target_id
      ? sub.kind === "film"
        ? store.getFilm(sub.target_id)
        : sub.kind === "person"
          ? store.getPerson(sub.target_id)
          : store.getOrg(sub.target_id)
      : Promise.resolve(null),
    sub.kind === "person" ? store.listPeople({ drafts: true }).catch(() => []) : Promise.resolve([]),
  ]);
  const rows = diffSubmission(sub, current, gaz);
  const sameName =
    sub.kind === "person"
      ? people.filter((x) => normalize(x.name) === normalize(sub.label) && x.id !== sub.target_id)
      : [];

  // Carga de archivo: qué traería el archivo para cada registro posible, comparado con lo que tiene HOY
  const isCarga = sub.origin === "carga";
  const cargaOptions: CargaOption[] = [];
  if (isCarga && sub.kind !== "person") {
    const names = { muni: (c: number | null | undefined) => gaz.muni(c ?? null)?.name ?? "", depto: (c: number | null | undefined) => gaz.depto(c ?? null)?.name ?? "" };
    const parsed = sub.kind === "film" ? filmSchema.safeParse(sub.payload) : orgSchema.safeParse(sub.payload);
    const incoming = parsed.success ? parsed.data : sub.payload;
    const refs = sub.target_id ? [{ id: sub.target_id, level: undefined, score: undefined }] : (sub.candidates ?? []).map((c) => ({ id: c.id, level: c.level, score: c.score }));
    for (const r of refs) {
      const rec = sub.kind === "film" ? await store.getFilm(r.id) : await store.getOrg(r.id);
      if (!rec) continue;
      const items = sub.kind === "film" ? planFilmUpdate(rec as Film, incoming as unknown as FilmInput, names).items : planOrgUpdate(rec as Org, incoming as unknown as OrgInput, names).items;
      cargaOptions.push({ id: rec.id, title: sub.kind === "film" ? (rec as Film).title : (rec as Org).name, year: sub.kind === "film" ? (rec as Film).year : null, level: r.level, score: r.score, status: rec.status ?? "published", items });
    }
  }
  const isCorrection = !!sub.target_id;
  // corrección pendiente a un registro que existe: sus cambios se pueden marcar uno por uno
  const correctionItems = sub.status === "pending" && !isCarga && isCorrection && current && sub.kind !== "person" ? planCorrection(sub, current as Film | Org, gaz).items : [];
  const splitReview = correctionItems.length > 0;
  const visible = isCorrection ? rows : rows.filter((r) => r.after);
  const changes = rows.filter((r) => r.changed).length;
  const payload = sub.payload as { poster_url?: string | null; logo_url?: string | null; photo_url?: string | null };
  const proposedImage = (sub.kind === "film" ? payload.poster_url : sub.kind === "person" ? payload.photo_url : payload.logo_url) || null;
  const currentImage = current
    ? sub.kind === "film"
      ? (current as Film).poster_url
      : sub.kind === "person"
        ? (current as Person).photo_url
        : (current as Org).logo_url
    : null;
  const imageChanges = !!proposedImage && !!current && proposedImage !== currentImage;
  const imageLabel = sub.kind === "film" ? "Póster" : sub.kind === "person" ? "Foto" : "Logo";
  const resultHref = sub.result_id
    ? sub.kind === "film"
      ? `/admin/peliculas/${sub.result_id}`
      : sub.kind === "person"
        ? `/admin/personas/${sub.result_id}`
        : `/admin/entidades/${sub.result_id}`
    : null;
  const roundNotes = sub.kind === "film" && sub.status === "pending" ? decimalRoundNotes((sub.payload as FilmInput).locations) : [];

  return (
    <div className="max-w-3xl">
      <Link href="/admin/aportes" className="text-sm text-muted hover:text-ink">← Aportes</Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        {sub.origin === "recopilacion" && "Recopilación · "}{isCarga && "Carga de archivo · "}{isCarga ? (isCorrection ? "Diferencias con el registro" : "Coincidencia dudosa") : isCorrection ? "Corrección" : "Registro nuevo"} · {kindLabel(sub.kind)}
      </p>
      <h1 className="mt-1 font-display text-4xl tracking-tight">{sub.label}</h1>
      {sameName.length > 0 && (
        <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
          Ya hay {sameName.length === 1 ? "una persona" : `${sameName.length} personas`} con este nombre:{" "}
          {sameName.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link className="text-accent hover:underline" href={`/admin/personas/${p.id}`}>{p.name}</Link>
            </span>
          ))}
          . Revisa que no sea la misma antes de aprobar.
        </div>
      )}
      <p className="mt-1 text-sm text-muted">
        Enviado el {new Date(sub.created_at).toLocaleString("es-GT", { dateStyle: "long", timeStyle: "short" })}
        {sub.contact && <> · Correo: <a className="underline decoration-line underline-offset-2 hover:text-ink" href={`mailto:${sub.contact}`}>{sub.contact}</a></>}
      </p>

      {sub.origin === "recopilacion" && (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm leading-relaxed">
          <b>Aporte de recopilación.</b> Lo envió {sub.submitter ? <b>{sub.submitter}</b> : "alguien del equipo"} desde un enlace privado de solicitud de información.
          {current && (
            <> Registro: <Link className="text-accent hover:underline" href={sub.kind === "film" ? `/admin/peliculas/${current.id}` : `/admin/entidades/${current.id}`}>ver y solicitar de nuevo</Link>.</>
          )}
        </div>
      )}

      {isCarga && (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm leading-relaxed">
          <b>Aporte de carga de archivo.</b> Viene de «{sub.submitter ?? "un archivo"}». La carga no cambió nada de esto por su cuenta:{" "}
          {isCorrection ? "el registro ya existía y el archivo traía datos distintos a los guardados." : "no pudo saber si el registro ya existía."}
        </div>
      )}

      {sub.status !== "pending" && (
        <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <b>{sub.status === "approved" ? "Aprobado" : "Rechazado"}</b>
          {sub.reviewed_at && <> el {new Date(sub.reviewed_at).toLocaleDateString("es-GT", { dateStyle: "long" })}</>}
          {sub.reviewer_note && <p className="mt-1 text-muted">{sub.reviewer_note}</p>}
          {resultHref && <Link className="mt-1 inline-block text-accent hover:underline" href={resultHref}>Ver el registro →</Link>}
        </div>
      )}

      {sub.note ? (
        <div className="mt-5 rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Fuente de la información</div>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{sub.note}</p>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">Este aporte no trae fuente (es anterior a que fuera obligatoria).</p>
      )}
      {isCorrection && !current && (
        <p className="mt-5 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">El registro que se quería corregir ya no existe.</p>
      )}

      {proposedImage && (
        <section className="mt-8">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            {imageLabel} propuesto{imageChanges ? " · reemplazaría al actual" : ""}
          </h2>
          <div className="flex flex-wrap items-end gap-6 rounded-2xl border border-line bg-surface p-4">
            {imageChanges && currentImage && (
              <figure>
                <ImageBox url={currentImage} kind={sub.kind} alt={`${imageLabel} actual`} />
                <figcaption className="mt-1.5 text-xs text-muted">Actual</figcaption>
              </figure>
            )}
            <figure>
              <ImageBox url={proposedImage} kind={sub.kind} alt={`${imageLabel} propuesto`} />
              <figcaption className="mt-1.5 text-xs text-muted">{imageChanges ? "Propuesto" : "Enviado con el aporte"}</figcaption>
            </figure>
          </div>
          {sub.status === "pending" && !isCarga && <p className="mt-2 text-xs text-muted">Si rechazas el aporte, esta imagen se borra. Si lo apruebas, queda en el registro.</p>}
        </section>
      )}

      <h2 className="mb-2 mt-8 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {isCorrection ? `Datos propuestos · ${changes} ${changes === 1 ? "cambio" : "cambios"}` : "Datos propuestos"}
      </h2>
      {splitReview && (
        <p className="mb-2 text-xs text-muted">Abajo eliges qué cambios aplicar. Aquí están todos los datos del aporte, por si quieres compararlos.</p>
      )}
      <dl className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface", splitReview && "opacity-90")}>
        {visible.map((r) => (
          <div key={r.label} className={cn("grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]", r.changed && "bg-accent/5")}>
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="min-w-0 text-sm">
              {isCorrection && r.changed ? (
                <div className="space-y-1">
                  <div className="whitespace-pre-line text-muted line-through decoration-danger/50">{r.before ?? "—"}</div>
                  <div className="whitespace-pre-line text-ink">{r.after ?? "— (se vaciaría)"}</div>
                </div>
              ) : (
                <span className="whitespace-pre-line">{r.after ?? <span className="text-muted">—</span>}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {roundNotes.length > 0 && (
        <div className="mt-4 space-y-1 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm leading-relaxed text-warn">
          {roundNotes.map((n) => <p key={n}>{n}</p>)}
        </div>
      )}

      {sub.status === "pending" && isCarga && (
        <div className="mt-6">
          <ImportSubmissionReview id={sub.id} kind={sub.kind} doubt={!isCorrection} options={cargaOptions} />
        </div>
      )}
      {sub.status === "pending" && !isCarga && (
        <div className="mt-6">
          <SubmissionReview id={sub.id} isCorrection={isCorrection && !!current} hidden={!!current && current.status === "draft"} items={correctionItems} />
        </div>
      )}
    </div>
  );
}
