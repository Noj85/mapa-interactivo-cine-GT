"use client";

import { Check, GitMerge, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mergeFilmsAction } from "@/app/admin/actions";
import { CompletenessBadge } from "@/components/ui/Badges";
import { defaultChoice, type MergeChoice, type MergeItem, type MergePlan, type Side } from "@/lib/merge-films";
import { PosterImage } from "@/components/ui/PosterImage";
import { cn } from "@/lib/utils";

interface Card {
  id: string;
  title: string;
  year: number | null;
  completeness: number;
  published: boolean;
  poster: string | null;
  locations: number;
}

const FROM_LABEL: Record<MergeItem["from"], string> = { a: "Solo A", b: "Solo B", both: "En ambas" };

/** El alto lo fija quien lo usa; el ancho sale de la proporción del póster. Sin póster, un marco vacío. */
function Poster({ url, heightClass, emptyClass }: { url: string | null; heightClass: string; emptyClass: string }) {
  if (!url) return <span className={cn("block shrink-0 rounded-md bg-surface-2 ring-1 ring-line", emptyClass)} />;
  return <PosterImage src={url} heightClass={heightClass} maxWidthClass="max-w-[10rem]" className="rounded-md bg-surface-2 ring-1 ring-line" />;
}

/** Pantalla para fusionar dos producciones: cuál se queda, qué valor de cada campo y qué elementos de cada lista. */
export function FilmMerge({ a, b, plan }: { a: Card; b: Card; plan: MergePlan }) {
  const router = useRouter();
  const [choice, setChoice] = useState<MergeChoice>(() => defaultChoice(plan));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cards = { a, b };
  const drop = cards[choice.keep === "a" ? "b" : "a"];

  const setField = (key: string, side: Side) => setChoice((c) => ({ ...c, fields: { ...c.fields, [key]: side } }));
  const toggle = (list: "locations" | "festivals" | "companies" | "genres", key: string) =>
    setChoice((c) => ({ ...c, [list]: c[list].includes(key) ? c[list].filter((k) => k !== key) : [...c[list], key] }));

  const merge = () => {
    setError(null);
    start(async () => {
      const res = await mergeFilmsAction(a.id, b.id, choice);
      if (!res.ok) {
        setConfirming(false);
        return setError(res.error);
      }
      router.push(`/admin/peliculas/${res.id}`);
      router.refresh();
    });
  };

  const option = (active: boolean) =>
    cn(
      "flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
      active ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-muted/60 hover:text-ink",
    );

  const listSection = (title: string, list: "locations" | "festivals" | "companies" | "genres", items: MergeItem[]) =>
    items.length > 0 && (
      <section className="mt-8">
        <h2 className="label">{title}</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {items.map((i) => (
            <li key={i.key}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={choice[list].includes(i.key)} onChange={() => toggle(list, i.key)} />
                <span className="min-w-0 flex-1 whitespace-pre-line text-sm">{i.text}</span>
                <span className={cn("chip shrink-0 !py-0 text-[11px]", i.from === "both" && "!border-accent/40 !text-accent")}>{FROM_LABEL[i.from]}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div>
      <section>
        <h2 className="label">Cuál se queda</h2>
        <p className="mb-2 text-xs text-muted">La que se queda conserva su dirección en el mapa. A es la más completa.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((s) => {
            const f = cards[s];
            const active = choice.keep === s;
            return (
              <label key={s} className={cn(option(active), "p-3")}>
                <input type="radio" name="keep" className="mt-1 accent-[rgb(var(--accent))]" checked={active} onChange={() => setChoice((c) => ({ ...c, keep: s }))} />
                <Poster url={f.poster} heightClass="h-16" emptyClass="h-16 w-11" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{s.toUpperCase()}{active ? " · se queda" : " · se borra"}</span>
                  <span className="block truncate font-display text-lg text-ink">{f.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {f.year ?? "Sin año"} · {f.locations} {f.locations === 1 ? "locación" : "locaciones"} · {f.published ? "En el mapa" : "Oculta"}
                    <CompletenessBadge pct={f.completeness} compact />
                  </span>
                  <Link href={`/admin/peliculas/${f.id}`} target="_blank" className="mt-1 inline-block text-xs text-accent hover:underline">Ver ficha</Link>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label">Datos que difieren</h2>
        {plan.fields.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">Los datos básicos son iguales en las dos.</p>
        ) : (
          <div className="space-y-3">
            {plan.fields.map((f) => {
              const sel = choice.fields[f.key] ?? f.def;
              return (
                <div key={f.key} className="grid gap-2 sm:grid-cols-[150px_1fr_1fr] sm:items-start">
                  <div className="pt-2.5 text-xs text-muted">{f.label}</div>
                  {(["a", "b"] as const).map((s) => (
                    <label key={s} className={option(sel === s)}>
                      <input type="radio" name={`f-${f.key}`} className="mt-0.5 accent-[rgb(var(--accent))]" checked={sel === s} onChange={() => setField(f.key, s)} />
                      <span className="min-w-0 flex-1">
                        <span className="mr-1.5 text-[11px] font-semibold text-muted">{s.toUpperCase()}</span>
                        <span className={cn("whitespace-pre-line", f.key === "synopsis" && "line-clamp-4")}>{f[s] ?? <span className="text-muted">— vacío</span>}</span>
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {plan.poster && (
        <section className="mt-8">
          <h2 className="label">Póster</h2>
          <div className="flex flex-wrap gap-3">
            {(["a", "b"] as const).map((s) => (
              <label key={s} className={option((choice.poster ?? plan.poster!.def) === s)}>
                <input type="radio" name="poster" className="mt-0.5 accent-[rgb(var(--accent))]" checked={(choice.poster ?? plan.poster!.def) === s} onChange={() => setChoice((c) => ({ ...c, poster: s }))} />
                <span className="text-[11px] font-semibold text-muted">{s.toUpperCase()}</span>
                {plan.poster![s] ? <Poster url={plan.poster![s]} heightClass="h-36" emptyClass="h-36 w-24" /> : <span className="text-sm text-muted">Sin póster</span>}
              </label>
            ))}
          </div>
        </section>
      )}

      {listSection("Locaciones", "locations", plan.locations)}
      {listSection("Festivales y premios", "festivals", plan.festivals)}
      {listSection("Casas productoras", "companies", plan.companies)}
      {listSection("Géneros", "genres", plan.genres)}

      <div className="mt-8 rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm">
          Se queda <b>{cards[choice.keep].title}</b> ({choice.keep.toUpperCase()}) con lo elegido. <b>{drop.title}</b> ({choice.keep === "a" ? "B" : "A"}) se borra;
          sus aportes, solicitudes de información y preguntas pendientes pasan a la que se queda. No se puede deshacer.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {confirming ? (
            <>
              <button className="btn-primary" disabled={pending} onClick={merge}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar fusión
              </button>
              <button className="btn-ghost" disabled={pending} onClick={() => setConfirming(false)}>Cancelar</button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => setConfirming(true)}>
              <GitMerge className="h-4 w-4" /> Fusionar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
