import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmissionReview } from "@/components/admin/SubmissionReview";
import { adminStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { posterThumb } from "@/lib/poster-url";
import { diffSubmission } from "@/lib/submissions";
import type { Film, Org, SubmissionKind } from "@/lib/types";
import { cn } from "@/lib/utils";

function ImageBox({ url, kind, alt }: { url: string; kind: SubmissionKind; alt: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-line", kind === "org" ? "h-32 w-32 bg-white" : "h-48 w-32 bg-surface-2")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={posterThumb(url) ?? url} alt={alt} className={cn("h-full w-full", kind === "org" ? "object-contain p-2" : "object-cover")} />
    </div>
  );
}

export default async function AporteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await adminStore();
  const sub = await store.getSubmission(id);
  if (!sub) notFound();
  const [gaz, current] = await Promise.all([
    serverGazetteer(),
    sub.target_id ? (sub.kind === "film" ? store.getFilm(sub.target_id) : store.getOrg(sub.target_id)) : Promise.resolve(null),
  ]);
  const rows = diffSubmission(sub, current, gaz);
  const isCorrection = !!sub.target_id;
  const visible = isCorrection ? rows : rows.filter((r) => r.after);
  const changes = rows.filter((r) => r.changed).length;
  const payload = sub.payload as { poster_url?: string | null; logo_url?: string | null };
  const proposedImage = (sub.kind === "film" ? payload.poster_url : payload.logo_url) || null;
  const currentImage = current ? (sub.kind === "film" ? (current as Film).poster_url : (current as Org).logo_url) ?? null : null;
  const imageChanges = !!proposedImage && !!current && proposedImage !== currentImage;
  const imageLabel = sub.kind === "film" ? "Póster" : "Logo";
  const resultHref = sub.result_id ? (sub.kind === "film" ? `/admin/peliculas/${sub.result_id}` : `/admin/entidades/${sub.result_id}`) : null;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/aportes" className="text-sm text-muted hover:text-ink">← Aportes</Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        {isCorrection ? "Corrección" : "Registro nuevo"} · {sub.kind === "film" ? "Película" : "Entidad"}
      </p>
      <h1 className="mt-1 font-display text-4xl tracking-tight">{sub.label}</h1>
      <p className="mt-1 text-sm text-muted">
        Enviado el {new Date(sub.created_at).toLocaleString("es-GT", { dateStyle: "long", timeStyle: "short" })}
        {sub.contact && <> · Correo: <a className="underline decoration-line underline-offset-2 hover:text-ink" href={`mailto:${sub.contact}`}>{sub.contact}</a></>}
      </p>

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
          {sub.status === "pending" && <p className="mt-2 text-xs text-muted">Si rechazas el aporte, esta imagen se borra. Si lo apruebas, queda en el registro.</p>}
        </section>
      )}

      <h2 className="mb-2 mt-8 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {isCorrection ? `Datos propuestos · ${changes} ${changes === 1 ? "cambio" : "cambios"}` : "Datos propuestos"}
      </h2>
      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
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

      {sub.status === "pending" && (
        <div className="mt-6">
          <SubmissionReview id={sub.id} isCorrection={isCorrection && !!current} />
        </div>
      )}
    </div>
  );
}
