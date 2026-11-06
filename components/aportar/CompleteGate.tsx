"use client";

import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { openRequestAction, type OpenResult } from "@/app/completar/actions";
import { ContributeForm } from "@/components/aportar/ContributeForm";

/** Pantalla de clave del enlace privado; con la clave correcta muestra el formulario ya precargado. */
export function CompleteGate({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [opened, setOpened] = useState<Extract<OpenResult, { ok: true }> | null>(null);
  // enlace con varias producciones: cuál se está completando, cuáles ya se enviaron y los datos de quien responde
  const [current, setCurrent] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [who, setWho] = useState<{ submitter: string; email: string } | undefined>(undefined);

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await openRequestAction(token, password);
      if (!res.ok) return setError(res.error);
      setOpened(res);
      setSent(new Set(res.submitted ?? []));
      setCurrent(null);
    });
  };

  if (opened) {
    const films = opened.films?.length ? opened.films : opened.film ? [opened.film] : [];
    const many = films.length > 1;
    const film = many ? films.find((f) => f.id === current) : opened.film;
    const rec = film ?? opened.org;
    const title = film?.title ?? opened.org?.name ?? "";
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">PROCINE · Academia de Cine de Guatemala</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-[44px]">Completar información</h1>
        {many && !film ? (
          <>
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
              Gracias por ayudarnos a documentar el cine de Guatemala. Estas son tus {films.length} producciones. Abre cada una, corrige lo que esté mal y agrega lo que falte. Este espacio es privado para ellas.
            </p>
            <ul className="mt-8 max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {films.map((f) => {
                const done = sent.has(f.id);
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-lg leading-tight">
                        {f.title}
                        {f.year ? <span className="text-muted"> ({f.year})</span> : null}
                      </div>
                      <div className="mt-0.5 text-sm text-muted">
                        {f.missing_fields.length ? `Falta: ${f.missing_fields.join(", ")}.` : "Tenemos sus datos básicos; revisa que estén bien."}
                      </div>
                    </div>
                    {done && (
                      <span className="chip border-ok/40 text-ok">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Enviada
                      </span>
                    )}
                    <button className={done ? "btn-outline" : "btn-primary"} onClick={() => setCurrent(f.id)}>
                      {done ? "Revisar de nuevo" : "Completar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            {many && (
              <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink" onClick={() => setCurrent(null)}>
                <ArrowLeft className="h-4 w-4" /> Volver a la lista
              </button>
            )}
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
              Gracias por ayudarnos a documentar el cine de Guatemala. Revisa los datos de <b className="text-ink">{title}</b>, corrige lo que esté mal y agrega lo que falte. Este espacio es privado para {film ? (many ? "estas producciones" : "esta producción") : "esta entidad"}.
            </p>
            <div className="mt-8">
              <ContributeForm
                key={rec?.id}
                film={film}
                org={opened.org}
                collect={{ token, password, targetId: many ? film?.id : null }}
                identity={who}
                onBack={many ? () => setCurrent(null) : undefined}
                onSent={(w) => {
                  setWho(w);
                  if (film) setSent((x) => new Set(x).add(film.id));
                }}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="rounded-3xl border border-line bg-surface p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-3xl tracking-tight">Enlace privado</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          PROCINE, proyecto que ejecuta la Academia de Cine de Guatemala, te compartió este enlace para completar información para el Mapa del Cine de Guatemala. Escribe la clave de 5 caracteres que viene en el mensaje.
        </p>
        <form onSubmit={open} className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="rq-pass">Clave</label>
            <input
              id="rq-pass"
              className="field text-base"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="5 caracteres, ej.: k7m3x"
              maxLength={20}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={pending || !password.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Entrar
          </button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs leading-relaxed text-muted">
        Si no esperabas este mensaje, puedes ignorarlo. Cualquier duda, responde al mensaje que te llegó.
      </p>
    </div>
  );
}
