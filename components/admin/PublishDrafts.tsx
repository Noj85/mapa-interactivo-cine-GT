"use client";

import { Loader2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publishDraftFilmsAction } from "@/app/admin/actions";

/** Publica de una vez los borradores. Los que no tienen lugar de rodaje aparecen en «Sin ubicación». */
export function PublishDrafts({ drafts, withoutPlace }: { drafts: number; withoutPlace: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (drafts === 0) return null;

  const run = () => {
    const extra = withoutPlace > 0 ? ` ${withoutPlace} no tienen lugar de rodaje y aparecerán en la zona «Sin ubicación» del mapa.` : "";
    if (!confirm(`¿Publicar ${drafts} producción${drafts === 1 ? "" : "s"} en borrador?${extra}`)) return;
    setMsg(null);
    start(async () => {
      const res = await publishDraftFilmsAction();
      setMsg(res.ok ? `${res.published} publicadas.` : res.error);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <span className="min-w-0 flex-1 text-muted">
        <b className="font-medium text-ink">{drafts}</b> {drafts === 1 ? "producción está" : "producciones están"} en borrador y no se ven en el mapa.
      </span>
      <button className="btn-outline !py-1.5 text-xs" disabled={pending} onClick={run}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />} Publicar todas
      </button>
      {msg && <span className="w-full text-xs text-muted">{msg}</span>}
    </div>
  );
}
