"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, CircleHelp, Loader2, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PlaceSelect, type PlaceValue } from "@/components/records/PlaceSelect";
import {
  commitBatchAction,
  createImportAction,
  finalizeImportAction,
  type BatchResult,
  type DeferredQuestion,
} from "@/app/admin/(panel)/cargar/actions";
import { isAbroad } from "@/lib/completeness";
import { COUNTRIES } from "@/lib/countries";
import type { GeoBundle } from "@/lib/geo/load";
import { planFilmUpdate, planOrgUpdate } from "@/lib/import/diff";
import { applyAnswer, candidateStatus, type Question } from "@/lib/import/questions";
import type { Candidate, ImportPlan, PlaceResolution } from "@/lib/import/types";
import type { Film, Org } from "@/lib/types";
import { cn } from "@/lib/utils";

const BATCH = 20;
type Phase = "asking" | "summary" | "committing" | "done";

export function StepQuestions({
  geo,
  filename,
  plan,
  candidates,
  onCandidates,
  places,
  onPlaces,
  questions,
  onQuestions,
  onBack,
  onRestart,
}: {
  geo: GeoBundle;
  filename: string;
  plan: ImportPlan;
  candidates: Candidate[];
  onCandidates(c: Candidate[]): void;
  places: Record<string, PlaceResolution>;
  onPlaces(p: Record<string, PlaceResolution>): void;
  questions: Question[];
  onQuestions(q: Question[]): void;
  onBack(): void;
  onRestart(): void;
}) {
  const [phase, setPhase] = useState<Phase>(questions.some((q) => q.status === "open") ? "asking" : "summary");
  const [text, setText] = useState("");
  const [pickedPlace, setPickedPlace] = useState<PlaceValue>({ muni_ine: null, depto_ine: null });
  const [abroadOpen, setAbroadOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [publishIncomplete, setPublishIncomplete] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<BatchResult[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);

  const open = questions.filter((q) => q.status === "open");
  const current = open[0];
  const answered = questions.length - open.length;

  const setStatus = (id: string, status: Question["status"], answer?: string) =>
    onQuestions(questions.map((q) => (q.id === id ? { ...q, status, answer } : q)));

  const answer = (q: Question, value: string) => {
    setErr(null);
    const r = applyAnswer(candidates, q, value, geo.gaz, places);
    if (r.candidates === candidates && r.places === places) {
      setErr(value.startsWith("abroad:") ? "Escribe el país donde se rodó." : "No reconocimos ese lugar. Prueba con el nombre del municipio o del departamento.");
      return;
    }
    onCandidates(r.candidates);
    onPlaces(r.places);
    setStatus(q.id, "answered", value);
    setText("");
    setAbroadOpen(false);
    setCountry("");
    setCity("");
    if (open.length <= 1) setPhase("summary");
  };

  const defer = (q: Question) => {
    setErr(null);
    setStatus(q.id, "deferred");
    setText("");
    if (open.length <= 1) setPhase("summary");
  };

  const live = useMemo(() => candidates.filter((c) => c.include && c.decision !== "skip"), [candidates]);
  const summary = useMemo(() => {
    const st = live.map((c) => candidateStatus(c));
    const complete = st.filter((s) => s.completeness >= 100).length;
    return {
      total: live.length,
      films: live.filter((c) => c.type === "film").length,
      orgs: live.filter((c) => c.type === "org").length,
      complete,
      incomplete: live.length - complete,
      // Solo las entidades sin locación (o registros sin título) quedan como borrador.
      drafts: st.filter((s) => !s.publishable).length,
      // Producciones sin lugar de rodaje: se publican en la zona «Sin locación» del mapa.
      nowhere: live.filter(
        (c) => c.type === "film" && !(c.film?.locations ?? []).some((l) => l.muni_ine || l.depto_ine || (l.lat != null && l.lng != null) || isAbroad(l)),
      ).length,
      // registros que ya existían y a los que el archivo sí les completa o agrega algo
      updates: live.filter((c) => {
        if (!c.duplicate || c.decision !== "update") return false;
        const rec = c.duplicate.record;
        if (!rec) return true;
        const plan = c.type === "film" && c.film ? planFilmUpdate(rec as Film, c.film) : c.org ? planOrgUpdate(rec as Org, c.org) : null;
        if (!plan) return true;
        // los conflictos nunca se aplican desde la carga
        const on = new Set((c.accept ?? plan.items.filter((i) => i.defaultOn).map((i) => i.id)).filter((id) => plan.items.find((i) => i.id === id)?.group !== "conflict"));
        return plan.items.some((i) => on.has(i.id));
      }).length,
      // lo que no se puede decidir solo (coincidencia dudosa o diferencias con el registro existente) queda en Aportes
      toAportes: live.filter((c) => {
        if (c.decision === "review") return true;
        if (!c.duplicate || c.decision !== "update") return false;
        const rec = c.duplicate.record;
        const plan = !rec ? null : c.type === "film" && c.film ? planFilmUpdate(rec as Film, c.film) : c.org ? planOrgUpdate(rec as Org, c.org) : null;
        return !!plan?.items.some((i) => i.group === "conflict");
      }).length,
      deferred: questions.filter((q) => q.status === "deferred").length,
    };
  }, [live, questions]);

  const commit = async () => {
    setPhase("committing");
    setFatal(null);
    const all: BatchResult[] = [];
    setProgress({ done: 0, total: live.length });
    try {
      const importId = await createImportAction(filename, { engine: plan.engine, rows: live.length });
      for (let i = 0; i < live.length; i += BATCH) {
        // la copia del registro existente solo sirve para la vista previa: el servidor lo vuelve a leer
        const chunk = live.slice(i, i + BATCH).map((c) => ({ ...c, suggestions: undefined, ...(c.duplicate ? { duplicate: { ...c.duplicate, record: undefined } } : {}) }));
        const r = await commitBatchAction(importId, filename, chunk, publishIncomplete);
        all.push(...r);
        setProgress({ done: Math.min(i + BATCH, live.length), total: live.length });
      }

      // Las preguntas que quedaron pendientes viajan con el registro para responderlas después.
      const slugOf = new Map(all.filter((r) => r.slug).map((r) => [r.key, r.slug!]));
      const refOf = (c: Candidate) => {
        const slug = slugOf.get(c.key);
        return slug ? `${c.type}:${slug}` : null;
      };
      const deferred: DeferredQuestion[] = [];
      for (const q of questions.filter((x) => x.status === "deferred")) {
        const opts = q.options?.map((o) => o.label) ?? null;
        if (q.candidateKey) {
          const c = candidates.find((x) => x.key === q.candidateKey);
          if (c && refOf(c)) deferred.push({ record_ref: refOf(c), field: q.kind === "place" ? "location" : (q.field ?? null), question: q.question, options: opts });
        } else if (q.placeText) {
          for (const c of live.filter((x) => x.placeTexts.includes(q.placeText!)).slice(0, 40)) {
            if (refOf(c)) deferred.push({ record_ref: refOf(c), field: "location", question: q.question, options: opts });
          }
        } else {
          deferred.push({ record_ref: null, field: q.field ?? null, question: q.question, options: opts });
        }
      }
      await finalizeImportAction(
        importId,
        filename,
        {
          engine: plan.engine,
          created: all.filter((r) => r.action === "created").length,
          updated: all.filter((r) => r.action === "updated").length,
          unchanged: all.filter((r) => r.action === "unchanged").length,
          queued: all.filter((r) => r.queuedAportes).length,
          failed: all.filter((r) => r.action === "failed").length,
          pending_questions: deferred.length,
        },
        deferred,
      );
      setResults(all);
      setPhase("done");
    } catch (e) {
      setResults(all);
      setFatal((e as Error).message || "Algo falló al guardar.");
      setPhase("summary");
    }
  };

  // ───────────────────────── render ─────────────────────────

  if (phase === "asking" && current) {
    const pct = Math.round((answered / questions.length) * 100);
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3 text-xs text-muted">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span>{answered + 1} de {questions.length}</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={current.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="rounded-xl border border-line bg-surface p-6 sm:p-8">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <CircleHelp className="h-4 w-4" />
            </span>
            <h2 className="mt-4 font-display text-2xl leading-snug tracking-tight">{current.question}</h2>

            {!!current.options?.length && (
              <div className="mt-5 flex flex-wrap gap-2">
                {current.options.map((o) => (
                  <button key={o.value} onClick={() => answer(current, o.value)} className="chip !px-3.5 !py-2 text-sm transition hover:border-accent hover:text-accent">
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {current.kind === "place" ? (
              <div className="mt-5">
                {!!current.options?.length && <p className="mb-2 text-xs text-muted">O elige otro lugar:</p>}
                <PlaceSelect idPrefix={`q-${current.id}`} geo={geo} value={pickedPlace} onChange={setPickedPlace} />
                <button
                  className="btn-primary mt-3"
                  disabled={pickedPlace.depto_ine == null && pickedPlace.muni_ine == null}
                  onClick={() => {
                    const v = pickedPlace;
                    setPickedPlace({ muni_ine: null, depto_ine: null });
                    answer(current, v.muni_ine != null ? `muni:${v.muni_ine}` : `depto:${v.depto_ine}`);
                  }}
                >
                  Usar este lugar
                </button>
                {!current.id.startsWith("org-place:") && (
                  <div className="mt-4 border-t border-line pt-4">
                    {!abroadOpen ? (
                      <button type="button" className="text-sm text-muted underline underline-offset-2 hover:text-ink" onClick={() => setAbroadOpen(true)}>
                        Está fuera de Guatemala
                      </button>
                    ) : (
                      <div>
                        <p className="mb-2 text-xs text-muted">Se mostrará en la zona «Fuera de Guatemala» del mapa, no como «Sin locación».</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input className="field" list="q-countries" placeholder="País" aria-label="País" value={country} onChange={(e) => setCountry(e.target.value)} />
                          <input className="field" placeholder="Ciudad o lugar (opcional)" aria-label="Ciudad o lugar" value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                        <datalist id="q-countries">
                          {COUNTRIES.map((n) => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                        <button className="btn-primary mt-3" disabled={!country.trim()} onClick={() => answer(current, `abroad:${country.trim()}|${city.trim()}`)}>
                          Usar este país
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              !current.options?.length && (
                <form
                  className="mt-5 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) answer(current, text.trim());
                  }}
                >
                  <input autoFocus className="field flex-1" placeholder={current.placeholder || "Tu respuesta…"} value={text} onChange={(e) => setText(e.target.value)} />
                  <button className="btn-primary" disabled={!text.trim()}>Responder</button>
                </form>
              )
            )}

            {err && <p className="mt-3 text-sm text-warn">{err}</p>}
            {current.kind === "bulk" && <p className="mt-4 text-xs text-muted">Solo se completan las producciones a las que les falta este dato; no se cambia lo que ya tienen.</p>}

            <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
              <button className="text-sm text-muted hover:text-ink" onClick={() => defer(current)}>
                Dejar pendiente
              </button>
              <button className="text-sm text-muted hover:text-ink" onClick={() => setPhase("summary")}>
                Saltar todas las preguntas
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
        <p className="mt-4 text-center text-xs text-muted">Lo que dejes pendiente queda marcado como incompleto y podrás responderlo después desde el panel.</p>
      </div>
    );
  }

  if (phase === "committing") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center text-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="mt-4 font-display text-2xl">Guardando…</p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">{progress.done} de {progress.total}</p>
      </div>
    );
  }

  if (phase === "done") {
    const count = (a: BatchResult["action"]) => results.filter((r) => r.action === a).length;
    const failed = results.filter((r) => r.action === "failed");
    // qué campos se completaron en los registros existentes, sumados
    const totals = new Map<string, number>();
    for (const r of results) for (const f of r.filled ?? []) totals.set(f.replace(/ \((\d+)\)$/, ""), (totals.get(f.replace(/ \((\d+)\)$/, "")) ?? 0) + Number(f.match(/\((\d+)\)$/)?.[1] ?? 1));
    const queuedAportes = results.filter((r) => r.queuedAportes).length;
    const conflictFields = results.reduce((n, r) => n + (r.conflicts ?? 0), 0);
    const filledTotals = [...totals].sort((a, b) => b[1] - a[1]);
    return (
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ok/15 text-ok">
          <PartyPopper className="h-6 w-6" />
        </span>
        <h2 className="mt-5 font-display text-3xl tracking-tight">Listo, información cargada</h2>
        <p className="mt-2 text-sm text-muted">
          {count("created")} nuevos · {count("updated")} completados · {count("unchanged")} sin cambios
          {queuedAportes > 0 && <> · <b className="text-ink">{queuedAportes} enviados a Aportes</b></>}
          {failed.length > 0 && <> · <span className="text-danger">{failed.length} con error</span></>}
          {summary.deferred > 0 && <> · {summary.deferred} {summary.deferred === 1 ? "pregunta pendiente" : "preguntas pendientes"}</>}
        </p>
        {filledTotals.length > 0 && (
          <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted">
            <span className="font-medium text-ink">Se completó en los existentes:</span> {filledTotals.map(([k, n]) => `${k} (${n})`).join(", ")}.
          </p>
        )}
        {queuedAportes > 0 && (
          <div className="mx-auto mt-4 max-w-md rounded-2xl border border-warn/30 bg-warn/5 p-4 text-left text-xs leading-relaxed">
            <p className="font-medium text-ink">Quedó para revisar en Aportes («Carga de archivo»)</p>
            <p className="mt-1 text-muted">
              {conflictFields > 0 && <>{conflictFields} {conflictFields === 1 ? "dato que traía otro valor" : "datos que traían otro valor"} que el registro existente (no se cambió nada). </>}
              {results.filter((r) => r.action === "queued").length > 0 && <>{results.filter((r) => r.action === "queued").length} {results.filter((r) => r.action === "queued").length === 1 ? "registro con coincidencia dudosa" : "registros con coincidencia dudosa"} (no se creó ni se cambió nada). </>}
              Ahí decides qué se aplica.
            </p>
            <Link href="/admin/aportes?origen=carga" className="mt-2 inline-block text-accent hover:underline">Ir a los aportes →</Link>
          </div>
        )}
        {failed.length > 0 && (
          <ul className="mx-auto mt-4 max-w-md space-y-1 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-left text-xs text-danger">
            {failed.slice(0, 6).map((f) => (
              <li key={f.key}>{f.error}</li>
            ))}
            {failed.length > 6 && <li>… y {failed.length - 6} más</li>}
          </ul>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">Ver en el mapa <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/admin" className="btn-outline">Ir al panel</Link>
          <button className="btn-ghost" onClick={onRestart}>Cargar otro archivo</button>
        </div>
      </div>
    );
  }

  // summary
  return (
    <div className="mx-auto max-w-xl">
      <h2 className="font-display text-3xl tracking-tight">Todo listo para publicar</h2>
      <p className="mt-1 text-sm text-muted">Esto es lo que va a pasar al guardar.</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          [summary.total, "registros"],
          [summary.complete, "completos"],
          [summary.incomplete, "incompletos"],
        ].map(([n, l]) => (
          <div key={l as string} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="font-display text-3xl">{n}</div>
            <div className="text-xs text-muted">{l}</div>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1 text-sm text-muted">
        {summary.films > 0 && <li>{summary.films} producciones · {summary.orgs} entidades</li>}
        {summary.films === 0 && <li>{summary.orgs} entidades</li>}
        {summary.drafts > 0 && (
          <li className="text-warn">
            {summary.drafts} no tienen lo mínimo para publicarse (título, o locación en el caso de entidades): se guardan como borrador y solo las ve el equipo.
          </li>
        )}
        {summary.nowhere > 0 && (
          <li>
            {summary.nowhere === 1 ? "1 producción no tiene" : `${summary.nowhere} producciones no tienen`} lugar de rodaje: se muestran en la zona «Sin locación», fuera del territorio, hasta que agregues sus locaciones.
          </li>
        )}
        {summary.updates > 0 && <li>{summary.updates} completan registros que ya existían: solo lo vacío o lo que se agrega, sin pisar nada.</li>}
        {summary.toAportes > 0 && (
          <li className="text-warn">
            {summary.toAportes} {summary.toAportes === 1 ? "queda" : "quedan"} en Aportes («Carga de archivo») para que el equipo lo revise: datos distintos a los guardados o coincidencias dudosas. No se cambia ni se crea nada de eso ahora.
          </li>
        )}
        {summary.deferred > 0 && (
          <li>
            {summary.deferred === 1 ? "1 pregunta queda pendiente" : `${summary.deferred} preguntas quedan pendientes`} para después.
          </li>
        )}
      </ul>

      {summary.incomplete > 0 && (
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <input type="checkbox" className="mt-1 accent-[rgb(var(--accent))]" checked={publishIncomplete} onChange={(e) => setPublishIncomplete(e.target.checked)} />
          <span className="text-sm">
            <b>Publicar también los incompletos</b>
            <span className="mt-0.5 block text-muted">
              Aparecen en el mapa con la marca “Incompleta”. Si lo desactivas, se guardan como borrador y solo los ve el equipo.
            </span>
          </span>
        </label>
      )}

      {fatal && <p className="mt-4 text-sm text-danger">{fatal} {results.length > 0 && "Algunos registros alcanzaron a guardarse; revisa el panel antes de reintentar."}</p>}

      <div className="mt-8 flex items-center justify-between">
        <button className="btn-ghost" onClick={() => (open.length ? setPhase("asking") : onBack())}>
          {open.length ? "Volver a las preguntas" : "Volver a la revisión"}
        </button>
        <button className="btn-primary" disabled={summary.total === 0} onClick={commit}>
          <CheckCircle2 className="h-4 w-4" /> Publicar {summary.total}
        </button>
      </div>
    </div>
  );
}
