"use client";

import { Check, Copy, Loader2, Mail, MessageCircle, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createInfoRequestsAction, type CreatedRequest } from "@/app/admin/requests";
import type { SubmissionKind } from "@/lib/types";

export interface RequestTarget {
  id: string;
  title: string;
}

const DAYS = [15, 30, 60];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Genera el enlace privado + clave de uno o varios registros y deja el mensaje listo para
 * WhatsApp o correo. La clave solo se ve en esta pantalla.
 */
export function RequestInfoDialog({ kind, targets, onClose }: { kind: SubmissionKind; targets: RequestTarget[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recipient, setRecipient] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CreatedRequest[] | null>(null);
  const [bodies, setBodies] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const single = targets.length === 1;
  const isFilm = kind === "film";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const generate = () => {
    setError(null);
    start(async () => {
      const res = await createInfoRequestsAction(kind, targets.map((t) => t.id), { recipient, email: single ? email : null, days });
      if (!res.ok) return setError(res.error);
      setItems(res.items);
      setBodies(res.items.map((i) => i.body));
      router.refresh();
    });
  };

  const flash = async (key: string, text: string) => {
    if (await copy(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Solicitar información" className="w-full max-w-2xl rounded-2xl border border-line bg-bg p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Solicitar información</h2>
            <p className="mt-0.5 text-sm text-muted">
              {single ? (
                <>Un enlace privado con clave para completar {isFilm ? "la producción" : "la entidad"} <b className="font-medium text-ink">«{targets[0].title}»</b>.</>
              ) : (
                <>Un enlace privado y una clave distintos para cada uno de los {targets.length} registros.</>
              )}
            </p>
          </div>
          <button type="button" className="btn-ghost !min-h-0 !p-1.5" aria-label="Cerrar" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {!items ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="rq-name">Nombre de quien lo recibe (opcional)</label>
                <input id="rq-name" className="field" maxLength={200} placeholder="Ej. Ana López" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                {!single && <p className="mt-1 text-xs text-muted">Se usa el mismo saludo en todos los mensajes.</p>}
              </div>
              {single && (
                <div>
                  <label className="label" htmlFor="rq-email">Correo (opcional)</label>
                  <input id="rq-email" className="field" type="email" inputMode="email" maxLength={200} placeholder="Para dejar el correo ya dirigido" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              )}
              <div>
                <label className="label" htmlFor="rq-days">Vigencia del enlace</label>
                <select id="rq-days" className="field" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d} días</option>
                  ))}
                </select>
              </div>
            </div>
            {!single && (
              <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-sm text-muted">
                {targets.map((t) => (
                  <li key={t.id} className="truncate">{t.title}</li>
                ))}
              </ul>
            )}
            <p className="text-xs leading-relaxed text-muted">
              El enlace sirve varias veces hasta que venza o lo revoques. Lo que envíen llega a «Aportes» como <b className="font-medium text-ink">recopilación</b>, y nada se publica hasta que lo apruebes.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn-primary" disabled={pending} onClick={generate}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Generar mensaje
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-warn">
              La clave solo se muestra ahora. Copia el mensaje antes de cerrar; si lo pierdes, genera otra solicitud.
            </p>
            {items.map((it, i) => {
              const body = bodies[i] ?? it.body;
              const wa = `https://wa.me/?text=${encodeURIComponent(body)}`;
              const mail = `mailto:${encodeURIComponent(it.request.recipient_email ?? "")}?subject=${encodeURIComponent(it.subject)}&body=${encodeURIComponent(body)}`;
              return (
                <section key={it.target_id} className="rounded-2xl border border-line bg-surface p-4">
                  {!single && <h3 className="mb-2 font-display text-base">{it.title}</h3>}
                  <label className="label" htmlFor={`rq-body-${i}`}>Mensaje (puedes editarlo)</label>
                  <textarea
                    id={`rq-body-${i}`}
                    className="field min-h-64 font-sans text-[13px] leading-relaxed"
                    value={body}
                    onChange={(e) => setBodies((b) => b.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-primary !min-h-0 !py-2 text-xs" onClick={() => flash(`b${i}`, body)}>
                      {copied === `b${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === `b${i}` ? "Copiado" : "Copiar mensaje"}
                    </button>
                    <a className="btn-outline !min-h-0 !py-2 text-xs" href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" /> Abrir en WhatsApp
                    </a>
                    <a className="btn-outline !min-h-0 !py-2 text-xs" href={mail}>
                      <Mail className="h-3.5 w-3.5" /> Enviar por correo
                    </a>
                    <button className="btn-ghost !min-h-0 !py-2 text-xs" onClick={() => flash(`s${i}`, it.subject)}>
                      {copied === `s${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === `s${i}` ? "Copiado" : "Copiar asunto"}
                    </button>
                  </div>
                </section>
              );
            })}
            <div className="flex justify-end">
              <button className="btn-outline" onClick={onClose}>Listo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
