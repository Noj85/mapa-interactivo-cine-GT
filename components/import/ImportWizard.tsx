"use client";

import { ignoreRepeatedSheets } from "@/lib/import/repeated";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Sparkles, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { loadGeo, type GeoBundle } from "@/lib/geo/load";
import { planFilmUpdate, planOrgUpdate } from "@/lib/import/diff";
import { distinctValues } from "@/lib/import/distinct";
import { parseFile } from "@/lib/import/parse";
import { buildQuestions, type Question } from "@/lib/import/questions";
import { buildCandidates, collectPlaceTexts } from "@/lib/import/transform";
import type { Candidate, ImportPlan, ParsedFile, PlaceResolution, ResolveResponse } from "@/lib/import/types";
import type { DocxResponse } from "@/app/api/import/docx/route";
import type { PdfResponse } from "@/app/api/import/pdf/route";
import type { Film, Org } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StepQuestions } from "./StepQuestions";
import { StepReview } from "./StepReview";
import { StepUnderstand } from "./StepUnderstand";

type Step = "drop" | "understand" | "review" | "questions";
const STEPS: { id: Step; label: string }[] = [
  { id: "drop", label: "Archivo" },
  { id: "understand", label: "Esto entendimos" },
  { id: "review", label: "Revisión" },
  { id: "questions", label: "Preguntas" },
];

/** Pide el plan a Claude con las instrucciones del equipo y los valores distintos de todas las filas. */
async function analyze(parsed: ParsedFile, instr: string): Promise<ImportPlan> {
  const res = await fetch("/api/import/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: parsed.filename,
      instructions: instr.trim() || undefined,
      sheets: parsed.sheets.map((s) => ({
        name: s.name,
        headers: s.headers,
        rows: s.rows.slice(0, 40),
        totalRows: s.totalRows,
        distinct: distinctValues(s),
      })),
    }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Tu sesión expiró. Vuelve a entrar." : "No pudimos analizar el archivo.");
  return ignoreRepeatedSheets(parsed, (await res.json()) as ImportPlan);
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("drop");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<ParsedFile | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [instructions, setInstructions] = useState("");
  const [geo, setGeo] = useState<GeoBundle | null>(null);
  const [places, setPlaces] = useState<Record<string, PlaceResolution>>({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [engine, setEngine] = useState<ResolveResponse["engine"]>("gazetteer");

  const reset = () => {
    setStep("drop");
    setFile(null);
    setPlan(null);
    setInstructions("");
    setCandidates([]);
    setQuestions([]);
    setPlaces({});
    setError(null);
  };

  // el texto que se esté escribiendo al soltar el archivo (sin volver a crear onFile en cada tecla)
  const instructionsRef = useRef("");
  instructionsRef.current = instructions;

  /** Vuelve a analizar el mismo archivo con otras instrucciones (reemplaza los ajustes manuales hechos en «Esto entendimos»). */
  const reanalyze = useCallback(async () => {
    if (!file) return;
    setError(null);
    setBusy("Volviendo a analizar…");
    try {
      setPlan(await analyze(file, instructionsRef.current));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [file]);

  const onFile = useCallback(async (f: File) => {
    setError(null);
    const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    const isDocx = /\.docx$/i.test(f.name) || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (/\.doc$/i.test(f.name)) {
      setError("Ese es un Word antiguo (.doc). Ábrelo en Word y guárdalo como .docx.");
      return;
    }
    if (!isPdf && !isDocx && !/\.(csv|tsv|txt|xlsx|xls|xlsm|ods)$/i.test(f.name)) {
      setError("Aceptamos PDF, Word (.docx), CSV o Excel (.xlsx, .xls).");
      return;
    }
    try {
      let parsed: ParsedFile;
      if (isPdf) {
        setBusy("Leyendo el PDF…");
        const form = new FormData();
        form.append("file", f);
        const r = await fetch("/api/import/pdf", { method: "POST", body: form });
        const j = (await r.json().catch(() => ({}))) as Partial<PdfResponse> & { error?: string };
        if (!r.ok || !j.file) throw new Error(j.error ?? (r.status === 401 ? "Tu sesión expiró. Vuelve a entrar." : "No pudimos leer el PDF."));
        parsed = { ...j.file, doc: { kind: "pdf", pages: j.pages ?? 0, engine: j.engine ?? "heuristic", notes: j.notes ?? [] } };
      } else if (isDocx) {
        setBusy("Leyendo el documento de Word…");
        const form = new FormData();
        form.append("file", f);
        const r = await fetch("/api/import/docx", { method: "POST", body: form });
        const j = (await r.json().catch(() => ({}))) as Partial<DocxResponse> & { error?: string };
        if (!r.ok || !j.file) throw new Error(j.error ?? (r.status === 401 ? "Tu sesión expiró. Vuelve a entrar." : "No pudimos leer el documento."));
        parsed = { ...j.file, doc: { kind: "docx", pages: 0, engine: j.engine ?? "heuristic", notes: j.notes ?? [] } };
      } else {
        setBusy("Leyendo el archivo…");
        parsed = await parseFile(f);
      }
      if (!parsed.sheets.length) throw new Error("No encontramos filas con datos en el archivo.");
      setFile(parsed);
      setBusy("Entendiendo qué trae cada hoja…");
      setPlan(await analyze(parsed, instructionsRef.current));
      setStep("understand");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const prepareReview = useCallback(async () => {
    if (!file || !plan) return;
    setError(null);
    try {
      setBusy("Ubicando lugares y buscando duplicados…");
      const g = geo ?? (await loadGeo());
      setGeo(g);
      const pre = buildCandidates(file, plan, {}, { gaz: g.gaz, muni: g.muni });
      if (!pre.length) throw new Error("Con este mapeo no salió ninguna fila. Revisa que haya una columna de título o nombre.");
      const res = await fetch("/api/import/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          places: collectPlaceTexts(file, plan),
          items: pre.map((c) => ({
            key: c.key,
            type: c.type,
            title: c.film?.title ?? c.org?.name ?? "",
            year: c.film?.year ?? null,
          })),
        }),
      });
      if (!res.ok) throw new Error("No pudimos resolver los lugares.");
      const r = (await res.json()) as ResolveResponse;
      setEngine(r.engine);
      setPlaces(r.places);
      const cands = buildCandidates(file, plan, r.places, { gaz: g.gaz, muni: g.muni }).map((c) => {
        const dup = r.duplicates[c.key];
        if (!dup) return c;
        // si el archivo no trae nada nuevo para el registro que ya existe, se omite de entrada
        const rec = dup.record;
        const news = !rec ? 1 : c.type === "film" && c.film ? planFilmUpdate(rec as Film, c.film).news : c.org ? planOrgUpdate(rec as Org, c.org).news : 1;
        return { ...c, duplicate: dup, decision: news > 0 ? ("update" as const) : ("skip" as const) };
      });
      setCandidates(cands);
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [file, plan, geo]);

  const toQuestions = useCallback(() => {
    setQuestions(buildQuestions(candidates, places, { mode: plan?.engine ?? "heuristic" }));
    setStep("questions");
  }, [candidates, places, plan]);

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div>
      <ol className="mb-8 flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors",
                i < stepIdx ? "bg-ok/20 text-ok" : i === stepIdx ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
              )}
            >
              {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden sm:inline", i === stepIdx ? "text-ink" : "text-muted")}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line sm:w-10" />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {step === "drop" && (
            <div>
              <div className="mb-4 rounded-xl border border-line bg-surface p-4">
                <label htmlFor="instr" className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-accent" /> Instrucciones para el análisis <span className="font-normal text-muted">(opcional)</span>
                </label>
                <textarea
                  id="instr"
                  rows={2}
                  maxLength={2000}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={!!busy}
                  className="field mt-2 resize-y text-sm"
                  placeholder="Ej.: el contenido categorizado como «corto» o «cortometraje» debe quedar en una sola categoría, Cortometraje."
                />
                <p className="mt-1 text-xs text-muted">
                  Escribe con libertad lo que quieras que el análisis tome en cuenta. Funciona para normalizar valores, elegir columnas o ignorar hojas.
                </p>
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFile(f);
                }}
                onClick={() => !busy && input.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && input.current?.click()}
                className={cn(
                  "flex min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition-colors",
                  drag ? "border-accent bg-accent/5" : "border-line hover:border-accent/60 hover:bg-surface-2/40",
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-accent" />
                    <p className="mt-4 font-display text-xl">{busy}</p>
                    <p className="mt-1 text-sm text-muted">{busy.includes("PDF") || busy.includes("Word") ? "Un documento largo puede tardar un par de minutos." : "Esto toma unos segundos."}</p>
                  </>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                      <Upload className="h-6 w-6" />
                    </div>
                    <p className="mt-5 font-display text-2xl tracking-tight">Suelta aquí tu archivo</p>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                      PDF, Word, CSV o Excel. No hace falta seguir un formato: nosotros entendemos qué trae
                      cada columna o ficha y te preguntamos lo que falte. Los PDF y Word pueden ser catálogos, directorios, listados o fichas.
                    </p>
                    <span className="btn-outline mt-6">
                      <FileSpreadsheet className="h-4 w-4" /> Elegir archivo
                    </span>
                  </>
                )}
                <input
                  ref={input}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {error && (
                <p className="mt-4 flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </p>
              )}
              <p className="mt-4 flex items-center gap-2 text-xs text-muted">
                <Sparkles className="h-3.5 w-3.5" /> Nada se publica sin que lo revises antes.
              </p>
            </div>
          )}

          {step === "understand" && file && plan && (
            <StepUnderstand
              file={file}
              plan={plan}
              onPlan={setPlan}
              busy={busy}
              error={error}
              onBack={reset}
              onNext={prepareReview}
              instructions={instructions}
              onInstructions={setInstructions}
              onReanalyze={reanalyze}
            />
          )}

          {step === "review" && geo && (
            <StepReview
              geo={geo}
              candidates={candidates}
              onCandidates={setCandidates}
              engine={engine}
              onBack={() => setStep("understand")}
              onNext={toQuestions}
            />
          )}

          {step === "questions" && geo && file && (
            <StepQuestions
              geo={geo}
              filename={file.filename}
              plan={plan!}
              candidates={candidates}
              onCandidates={setCandidates}
              places={places}
              onPlaces={setPlaces}
              questions={questions}
              onQuestions={setQuestions}
              onBack={() => setStep("review")}
              onRestart={reset}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
