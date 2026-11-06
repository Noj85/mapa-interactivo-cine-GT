"use client";

import { Check, Copy, Link2, Loader2, Mail, MessageCircle, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createInfoRequestsAction, loadRequestContextAction, type CreatedRequest, type RequestFilm } from "@/app/admin/requests";
import type { SubmissionKind } from "@/lib/types";

export interface RequestTarget {
  id: string;
  title: string;
}

/** Un director/a con varias producciones entre las elegidas. */
interface DirectorGroup {
  director: string;
  ids: string[];
}

/** Un solo nombre de persona (sin «,», «/», «&» ni «y») sirve como saludo. */
const singleName = (d: string | null | undefined) => (d && !/[,;/&]|\s(y|e|and)\s/i.test(d) ? d.trim() : "");

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
 *
 * Con producciones, un mismo enlace puede incluir varias del mismo director/a: con una sola elegida se
 * sugieren las demás de esa persona; con varias, se agrupan por director/a y cada grupo puede ir en un enlace.
 * Los enlaces valen 30 días.
 */
export function RequestInfoDialog({ kind, targets, onClose }: { kind: SubmissionKind; targets: RequestTarget[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recipient, setRecipient] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CreatedRequest[] | null>(null);
  const [bodies, setBodies] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const single = targets.length === 1;
  const isFilm = kind === "film";

  // contexto de producciones: lo que les falta, quiénes comparten director/a y qué otras producciones tiene esa persona
  const [loading, setLoading] = useState(isFilm);
  const [films, setFilms] = useState<RequestFilm[]>([]);
  const [groups, setGroups] = useState<DirectorGroup[]>([]);
  const [related, setRelated] = useState<RequestFilm[]>([]);
  // una sola elegida: las demás del mismo director/a que se suman al enlace
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // varias elegidas: grupos de director/a que se dejan en un solo enlace (por defecto, todos)
  const [apart, setApart] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isFilm) return;
    let live = true;
    loadRequestContextAction(targets.map((t) => t.id)).then((res) => {
      if (!live) return;
      setLoading(false);
      if (!res.ok) return; // sin contexto igual se puede generar: un enlace por producción
      setFilms(res.films);
      setGroups(res.groups);
      setRelated(res.related);
      setPicked(new Set(res.related.filter((f) => f.completeness < 100).map((f) => f.id)));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // con una sola elegida, al sumar otras producciones el saludo sugiere el nombre de la persona (si no se escribió otro)
  const director = singleName(films[0]?.director);
  useEffect(() => {
    if (single && !recipientTouched) setRecipient(picked.size > 0 ? director : "");
  }, [single, picked, director, recipientTouched]);

  /** Los enlaces que se van a crear: cada uno es la lista de producciones que comparte. */
  const plan = useMemo<string[][]>(() => {
    if (!isFilm) return targets.map((t) => [t.id]);
    if (single) return [[targets[0].id, ...related.filter((f) => picked.has(f.id)).map((f) => f.id)]];
    const merged = groups.filter((g) => !apart.has(g.director));
    const of = new Map<string, string[]>();
    for (const g of merged) for (const id of g.ids) of.set(id, g.ids);
    const done = new Set<string>();
    const out: string[][] = [];
    for (const t of targets) {
      const grp = of.get(t.id);
      if (!grp) out.push([t.id]);
      else if (!done.has(grp[0])) {
        done.add(grp[0]);
        out.push(grp);
      }
    }
    return out;
  }, [isFilm, single, targets, related, picked, groups, apart]);

  const active = films.filter((f) => f.activeRequests > 0).length + (single ? related.filter((f) => picked.has(f.id) && f.activeRequests > 0).length : 0);

  const generate = () => {
    setError(null);
    start(async () => {
      const res = await createInfoRequestsAction(kind, plan, { recipient, email: plan.length === 1 && plan[0].length === 1 ? email : null });
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

  const togglePicked = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleApart = (d: string) =>
    setApart((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  const filmLine = (f: RequestFilm) => (
    <span className="min-w-0 flex-1">
      <span className="text-ink">{f.title}</span>
      {f.year ? <span className="text-muted"> ({f.year})</span> : null}
      <span className="block text-xs text-muted">
        {f.completeness >= 100 ? "Completa" : f.missing.length ? `Falta: ${f.missing.slice(0, 4).join(", ")}${f.missing.length > 4 ? "…" : ""}` : "Incompleta"}
        {f.hidden ? " · oculta del mapa" : ""}
        {f.activeRequests > 0 ? " · ya tiene un enlace activo" : ""}
      </span>
    </span>
  );

  const links = plan.length;
  const onlyOne = links === 1 && plan[0].length === 1;

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
                <>Un enlace privado y una clave para cada solicitud, para los {targets.length} registros elegidos.</>
              )}
            </p>
          </div>
          <button type="button" className="btn-ghost !min-h-0 !p-1.5" aria-label="Cerrar" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {!items ? (
          <div className="space-y-4">
            {single && isFilm && related.length > 0 && (
              <fieldset className="rounded-xl border border-line bg-surface p-3">
                <legend className="px-1 text-sm font-medium">
                  Otras producciones de {director || "la misma persona"}
                </legend>
                <p className="mb-2 text-xs text-muted">Elige cuáles se suman al mismo enlace: quien lo abra verá todas y completará cada una.</p>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {related.map((f) => (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                        <input type="checkbox" className="mt-1 accent-[rgb(var(--accent))]" checked={picked.has(f.id)} onChange={() => togglePicked(f.id)} />
                        {filmLine(f)}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            {!single && isFilm && groups.length > 0 && (
              <div className="space-y-2">
                {groups.map((g) => {
                  const on = !apart.has(g.director);
                  const gFilms = films.filter((f) => g.ids.includes(f.id));
                  return (
                    <div key={g.director} className="rounded-xl border border-line bg-surface p-3">
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                        <input type="checkbox" className="mt-1 accent-[rgb(var(--accent))]" checked={on} onChange={() => toggleApart(g.director)} />
                        <span className="min-w-0 flex-1">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Link2 className="h-3.5 w-3.5 text-accent" /> Un solo enlace para las {g.ids.length} de {g.director}
                          </span>
                          <span className="block text-xs text-muted">
                            {gFilms.map((f) => f.title).join(" · ")}
                          </span>
                        </span>
                      </label>
                    </div>
                  );
                })}
                <p className="text-xs text-muted">
                  {links === 1 ? "Se generará 1 enlace." : `Se generarán ${links} enlaces.`} Si apagas un grupo, cada producción lleva su propio enlace.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="rq-name">Nombre de quien lo recibe (opcional)</label>
                <input
                  id="rq-name"
                  className="field"
                  maxLength={200}
                  placeholder="Ej. Ana López"
                  value={recipient}
                  onChange={(e) => {
                    setRecipientTouched(true);
                    setRecipient(e.target.value);
                  }}
                />
                {!single && <p className="mt-1 text-xs text-muted">Se usa el mismo saludo en todos los mensajes.</p>}
              </div>
              {onlyOne && (
                <div>
                  <label className="label" htmlFor="rq-email">Correo (opcional)</label>
                  <input id="rq-email" className="field" type="email" inputMode="email" maxLength={200} placeholder="Para dejar el correo ya dirigido" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              )}
            </div>
            {!single && groups.length === 0 && (
              <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-sm text-muted">
                {targets.map((t) => (
                  <li key={t.id} className="truncate">{t.title}</li>
                ))}
              </ul>
            )}
            {active > 0 && (
              <p className="text-xs text-warn">
                {active === 1 ? "Una de las producciones ya tiene un enlace activo" : `${active} producciones ya tienen un enlace activo`}. Puedes generar otro igual; los anteriores siguen vigentes hasta que los revoques.
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted">
              El enlace vale 30 días y sirve varias veces hasta que venza o lo revoques. Lo que envíen llega a «Aportes» como <b className="font-medium text-ink">recopilación</b>, una producción por aporte, y nada se publica hasta que lo apruebes.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn-primary" disabled={pending || loading} onClick={generate}>
                {pending || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Generar mensaje{links > 1 ? "s" : ""}
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
              const many = it.titles.length > 1;
              return (
                <section key={it.target_id} className="rounded-2xl border border-line bg-surface p-4">
                  {(items.length > 1 || many) && (
                    <h3 className="mb-2 font-display text-base">{many ? `${it.title} y ${it.titles.length - 1} más` : it.title}</h3>
                  )}
                  {many && <p className="mb-2 text-xs text-muted">Incluye: {it.titles.join(" · ")}</p>}
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
