"use client";

import { KeyRound, Loader2, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { openRequestAction, type OpenResult } from "@/app/completar/actions";
import { ContributeForm } from "@/components/aportar/ContributeForm";

/** Pantalla de contraseña del enlace privado; con la contraseña correcta muestra el formulario ya precargado. */
export function CompleteGate({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [opened, setOpened] = useState<Extract<OpenResult, { ok: true }> | null>(null);

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await openRequestAction(token, password);
      if (!res.ok) return setError(res.error);
      setOpened(res);
    });
  };

  if (opened) {
    const rec = opened.film ?? opened.org;
    const title = opened.film?.title ?? opened.org?.name ?? "";
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Eje de Investigación · PROCINE y Academia de Cine</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-[44px]">Completar información</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
          Gracias por ayudarnos a documentar el cine de Guatemala. Revisa los datos de <b className="text-ink">{title}</b>, corrige lo que esté mal y agrega lo que falte. Este espacio es privado para {opened.film ? "esta producción" : "esta entidad"}.
        </p>
        <div className="mt-8">
          <ContributeForm key={rec?.id} film={opened.film} org={opened.org} collect={{ token, password }} />
        </div>
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
          El Eje de Investigación de PROCINE y la Academia de Cine de Guatemala te compartió este enlace para completar información para el Mapa del Cine de Guatemala. Escribe la contraseña que viene en el mensaje.
        </p>
        <form onSubmit={open} className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="rq-pass">Contraseña</label>
            <input
              id="rq-pass"
              className="field text-base"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ejemplo: cine-selva-4821"
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
