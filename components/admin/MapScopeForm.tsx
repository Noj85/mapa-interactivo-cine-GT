"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveMapScopeAction } from "@/app/admin/settings";
import type { MapScope } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/** Un interruptor: solo Guatemala (el resto del mapa base se tapa) o también países vecinos y mar. */
export function MapScopeForm({ initial }: { initial: MapScope }) {
  const [on, setOn] = useState(initial.onlyGuatemala);
  const [saved, setSaved] = useState(initial.onlyGuatemala);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = on !== saved;

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveMapScopeAction({ onlyGuatemala: on });
      if (r.ok) {
        setSaved(on);
        setMsg({ ok: true, text: "Guardado. El mapa ya usa esta zona; quien lo tenga abierto la verá al recargar." });
      } else setMsg({ ok: false, text: r.error });
    });

  return (
    <div>
      <div className="flex items-start gap-4 overflow-hidden rounded-2xl border border-line bg-surface px-4 py-4">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Mostrar solo Guatemala en el mapa"
          onClick={() => setOn(!on)}
          className={cn("relative mt-1 h-6 w-11 shrink-0 rounded-full border transition-colors", on ? "border-accent bg-accent" : "border-line bg-surface-2")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-ink">Mostrar solo Guatemala</h3>
          <p className="mt-0.5 text-xs text-muted">
            {on
              ? "Encendido: se ve únicamente el territorio guatemalteco. México, Belice, Honduras, El Salvador y el mar quedan en blanco, sin nombres ni carreteras de afuera."
              : "Apagado: el mapa muestra también los países vecinos y el mar, atenuados, con el territorio de Guatemala resaltado."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={!dirty || pending} onClick={save}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
        {dirty && !pending && <span className="text-xs text-muted">Hay cambios sin guardar.</span>}
        {msg && (
          <span role="status" className={cn("text-sm", msg.ok ? "text-accent" : "text-danger")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
