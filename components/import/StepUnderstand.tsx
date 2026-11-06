"use client";

import { ArrowRight, Bot, ChevronDown, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { FORMATS } from "@/lib/film-types";
import { FILM_FIELDS, ORG_FIELDS, type ImportPlan, type ParsedFile, type SheetPlan } from "@/lib/import/types";
import { cn } from "@/lib/utils";

const ENTITY_LABEL: Record<SheetPlan["entity"], string> = {
  film: "Producciones y locaciones",
  org: "Entidades (circulación o industria)",
  ignore: "Ignorar esta hoja",
};

function ConfidenceChip({ v }: { v: number | undefined }) {
  if (v == null) return null;
  const pct = Math.round(v * 100);
  return (
    <span
      className={cn(
        "chip !py-0 text-[11px]",
        v >= 0.8 ? "border-ok/40 text-ok" : v >= 0.6 ? "border-warn/40 text-warn" : "border-danger/40 text-danger",
      )}
    >
      {pct}%
    </span>
  );
}

export function StepUnderstand({
  file,
  plan,
  onPlan,
  busy,
  error,
  onBack,
  onNext,
  instructions,
  onInstructions,
  onReanalyze,
}: {
  file: ParsedFile;
  plan: ImportPlan;
  onPlan(p: ImportPlan): void;
  busy: string | null;
  error: string | null;
  onBack(): void;
  onNext(): void;
  instructions: string;
  onInstructions(v: string): void;
  onReanalyze(): void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const update = (sheet: string, patch: Partial<SheetPlan>) =>
    onPlan({ ...plan, sheets: plan.sheets.map((s) => (s.sheet === sheet ? { ...s, ...patch } : s)) });

  const setColumn = (sheet: string, field: string, header: string) => {
    const sp = plan.sheets.find((s) => s.sheet === sheet)!;
    const columns = { ...sp.columns };
    const confidence = { ...sp.confidence };
    if (header) {
      columns[field] = header;
      confidence[field] = 1; // lo confirmó una persona
    } else {
      delete columns[field];
      delete confidence[field];
    }
    update(sheet, { columns, confidence });
  };

  const answerQuestion = (qid: string, value: string) => {
    setAnswers((a) => ({ ...a, [qid]: value }));
    const q = plan.questions.find((x) => x.id === qid);
    if (!q?.sheet || !q.field) return;
    if (q.field === "layer" && (value === "circulacion" || value === "industria")) update(q.sheet, { layer: value });
    // «¿Qué formato es "Telefilme"?»: la respuesta queda como equivalencia de ese valor del archivo
    if (q.value && q.field === "format") {
      const id = FORMATS.find((f) => f.label === value)?.id ?? "";
      const sp = plan.sheets.find((s) => s.sheet === q.sheet);
      if (sp) update(q.sheet, { value_maps: { ...sp.value_maps, format: { ...sp.value_maps?.format, [q.value]: id } } });
      return;
    }
    const sheet = file.sheets.find((s) => s.name === q.sheet);
    if (sheet?.headers.includes(value)) setColumn(q.sheet, q.field, value);
  };

  const usable = plan.sheets.filter((s) => s.entity !== "ignore");
  const totalRows = file.sheets.reduce((n, s) => n + s.totalRows, 0);
  const canContinue = usable.some((s) => (s.entity === "film" ? s.columns.title : s.columns.name));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
            {plan.engine === "claude" ? <Bot className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
          </span>
          <div>
            <p className="font-display text-xl leading-snug">{plan.summary || "Revisamos tu archivo."}</p>
            <p className="mt-1 text-xs text-muted">
              {file.filename} · {file.sheets.length} {file.sheets.length === 1 ? "hoja" : "hojas"} · {totalRows.toLocaleString("es-GT")} filas ·{" "}
              {plan.engine === "claude" ? "Analizado con Claude" : "Reconocimiento básico de columnas (sin Claude)"}
            </p>
          </div>
        </div>
      </div>

      {plan.instructions_applied && plan.instructions_applied.length > 0 && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-accent" /> Qué hicimos con tus instrucciones
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-muted">
            {plan.instructions_applied.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {file.doc && (
        <div className="rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
          <p className="font-medium">
            {file.doc.kind === "pdf"
              ? `Esto salió de un PDF de ${file.doc.pages} ${file.doc.pages === 1 ? "página" : "páginas"}`
              : "Esto salió de un documento de Word"}
            {file.doc.engine === "claude" ? ", leído con Claude." : file.doc.kind === "pdf" ? ", con lectura básica." : ", a partir de sus tablas."}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {file.doc.kind === "pdf" ? "Un PDF" : "Un documento de Word"} no es una base de datos: confirma las columnas aquí y revisa cada registro en el siguiente paso, sobre todo
            nombres, lugares y contactos.
            {file.doc.kind === "pdf" ? " La columna «Página del PDF» te dice dónde buscar cada registro en el documento original." : ""}
          </p>
          {file.doc.notes.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
              {file.doc.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {plan.questions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Para confirmar</h2>
          {plan.questions.map((q) => (
            <div key={q.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="text-sm">{q.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {q.options?.map((o) => (
                  <button
                    key={o}
                    onClick={() => answerQuestion(q.id, o)}
                    className={cn("chip transition", answers[q.id] === o ? "border-accent bg-accent/10 text-accent" : "hover:border-accent hover:text-ink")}
                  >
                    {o === "circulacion" ? "Circulación" : o === "industria" ? "Industria" : o}
                  </button>
                ))}
                {!q.options?.length && (
                  <input className="field !py-1.5" placeholder="Tu respuesta…" onBlur={(e) => e.target.value && answerQuestion(q.id, e.target.value)} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="group rounded-xl border border-line bg-surface px-4 py-3" open={instructions.trim().length > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-accent" /> Instrucciones para el análisis
          <ChevronDown className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <textarea
          rows={3}
          maxLength={2000}
          value={instructions}
          onChange={(e) => onInstructions(e.target.value)}
          disabled={!!busy}
          className="field mt-3 resize-y text-sm"
          placeholder="Ej.: el contenido categorizado como «corto» o «cortometraje» debe quedar en una sola categoría, Cortometraje."
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">Al volver a analizar se rehace el mapeo y se pierden los ajustes manuales de abajo.</p>
          <button className="btn-outline" onClick={onReanalyze} disabled={!!busy || !instructions.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Volver a analizar
          </button>
        </div>
      </details>

      <div className="space-y-4">
        {plan.sheets.map((sp) => {
          const sheet = file.sheets.find((s) => s.name === sp.sheet)!;
          const fields = sp.entity === "org" ? ORG_FIELDS : FILM_FIELDS;
          const mapped = fields.filter((f) => sp.columns[f.id]);
          const unmapped = fields.filter((f) => !sp.columns[f.id]);
          const open = sp.entity !== "ignore";
          // columnas del archivo que ningún campo usa (la «Página del PDF» es solo una referencia)
          const used = new Set(Object.values(sp.columns));
          const leftover = sheet.headers.filter((h) => !used.has(h) && h !== "Página del PDF" && sheet.rows.some((r) => (r[h] ?? "").trim() !== ""));
          return (
            <section key={sp.sheet} className={cn("rounded-xl border bg-surface p-5", open ? "border-line" : "border-line/60 opacity-70")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg">{sp.sheet}</h3>
                  <p className="text-xs text-muted">{sheet.totalRows.toLocaleString("es-GT")} filas · {sheet.headers.length} columnas</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select className="field !w-auto !py-1.5 text-xs" value={sp.entity} onChange={(e) => update(sp.sheet, { entity: e.target.value as SheetPlan["entity"], layer: e.target.value === "org" ? (sp.layer ?? "circulacion") : undefined })}>
                    {(Object.keys(ENTITY_LABEL) as SheetPlan["entity"][]).map((k) => (
                      <option key={k} value={k}>{ENTITY_LABEL[k]}</option>
                    ))}
                  </select>
                  {sp.entity === "org" && (
                    <select className="field !w-auto !py-1.5 text-xs" value={sp.layer ?? "circulacion"} onChange={(e) => update(sp.sheet, { layer: e.target.value as "circulacion" | "industria" })}>
                      <option value="circulacion">Capa: Circulación</option>
                      <option value="industria">Capa: Industria</option>
                    </select>
                  )}
                  {sp.entity === "film" && (
                    <select className="field !w-auto !py-1.5 text-xs" value={sp.grain} onChange={(e) => update(sp.sheet, { grain: e.target.value as SheetPlan["grain"] })}>
                      <option value="row_per_film">Una fila por producción</option>
                      <option value="row_per_location">Una fila por locación o festival</option>
                    </select>
                  )}
                </div>
              </div>
              {sp.note && <p className="mt-2 text-xs text-muted">{sp.note}</p>}

              {open && (
                <>
                  <div className="mt-4 divide-y divide-line/70 rounded-2xl border border-line/70">
                    {mapped.length === 0 && <p className="px-4 py-3 text-sm text-muted">No reconocimos columnas. Asígnalas abajo.</p>}
                    {mapped.map((f) => (
                      <div key={f.id} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-3 px-4 py-2">
                        <div>
                          <div className="text-sm">{f.label}</div>
                          {sheet.rows[0] && <div className="truncate text-[11px] text-muted">Ej.: {sheet.rows[0][sp.columns[f.id]] || "—"}</div>}
                        </div>
                        <select className="field !py-1.5 text-sm" value={sp.columns[f.id]} onChange={(e) => setColumn(sp.sheet, f.id, e.target.value)}>
                          <option value="">No usar</option>
                          {sheet.headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <ConfidenceChip v={sp.confidence[f.id]} />
                      </div>
                    ))}
                  </div>
                  {leftover.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs leading-relaxed">
                      <p className="font-medium text-warn">
                        {leftover.length === 1 ? "1 columna del archivo no se va a usar" : `${leftover.length} columnas del archivo no se van a usar`}
                      </p>
                      <p className="mt-0.5 text-muted">
                        {leftover.slice(0, 12).map((h) => `«${h}»`).join(", ")}
                        {leftover.length > 12 ? `… y ${leftover.length - 12} más` : ""}. Si alguna trae datos que registramos (formato, género, festival, lugar…), asígnala en «Campos sin columna».
                      </p>
                    </div>
                  )}
                  {unmapped.length > 0 && (
                    <details className="group mt-3">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted hover:text-ink">
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                        Campos sin columna ({unmapped.length})
                      </summary>
                      <div className="mt-2 divide-y divide-line/70 rounded-2xl border border-line/70">
                        {unmapped.map((f) => (
                          <div key={f.id} className="grid grid-cols-[1fr_1.4fr] items-center gap-3 px-4 py-2">
                            <div className="text-sm text-muted">{f.label}</div>
                            <select className="field !py-1.5 text-sm" value="" onChange={(e) => setColumn(sp.sheet, f.id, e.target.value)}>
                              <option value="">Sin columna</option>
                              {sheet.headers.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between">
        <button className="btn-ghost" onClick={onBack} disabled={!!busy}>Elegir otro archivo</button>
        <button className="btn-primary" onClick={onNext} disabled={!canContinue || !!busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ?? "Continuar a la revisión"}
          {!busy && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
      {!canContinue && <p className="text-right text-xs text-warn">Falta indicar qué columna trae el título (producciones) o el nombre (entidades).</p>}
    </div>
  );
}
