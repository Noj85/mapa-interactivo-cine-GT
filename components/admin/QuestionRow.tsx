"use client";

import { Check, Clock } from "lucide-react";
import { useState, useTransition } from "react";
import { answerQuestionAction } from "@/app/admin/actions";
import type { ImportQuestion } from "@/lib/types";

export function QuestionRow({ q, label }: { q: ImportQuestion; label?: string }) {
  const [value, setValue] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const send = (answer: string | null, status: "answered" | "deferred") =>
    start(async () => {
      await answerQuestionAction(q.id, answer, status);
      setDone(true);
    });

  if (done) return <li className="rounded-2xl border border-line px-4 py-3 text-sm text-ok">Respuesta guardada.</li>;

  return (
    <li className="rounded-2xl border border-line bg-surface px-4 py-3">
      {label && <div className="mb-0.5 text-xs text-muted">{label}</div>}
      <div className="text-sm text-ink">{q.question}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {q.options?.length ? (
          q.options.map((o) => (
            <button key={o} className="chip transition hover:border-accent hover:text-ink" disabled={pending} onClick={() => send(o, "answered")}>
              {o}
            </button>
          ))
        ) : (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) send(value.trim(), "answered");
            }}
          >
            <input className="field !py-1.5" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Tu respuesta…" />
            <button className="btn-primary !px-3 !py-1.5" disabled={pending || !value.trim()}>
              <Check className="h-4 w-4" />
            </button>
          </form>
        )}
        {q.status === "open" && (
          <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={pending} onClick={() => send(null, "deferred")}>
            <Clock className="h-3.5 w-3.5" /> Dejar pendiente
          </button>
        )}
      </div>
    </li>
  );
}
