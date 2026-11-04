"use client";

import { CheckCircle2, ImagePlus, Loader2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { setPosterAction } from "@/app/admin/actions";
import { normalize } from "@/lib/utils";
import { uploadPoster } from "./PosterField";

interface Target {
  id: string;
  title: string;
  slug: string;
}

type Line = { name: string; state: "ok" | "nomatch" | "error" | "working"; film?: string; detail?: string };

/** Carga masiva: el nombre del archivo debe coincidir con el título (o el slug) de la película. */
export function BulkPosterUploader({ films }: { films: Target[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const index = new Map<string, Target>();
  for (const f of films) {
    index.set(normalize(f.title), f);
    index.set(normalize(f.slug), f);
  }

  const run = async (files: File[]) => {
    const images = files.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!images.length) return;
    setBusy(true);
    const out: Line[] = images.map((f) => ({ name: f.name, state: "working" }));
    setLines([...out]);
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const film = index.get(normalize(file.name.replace(/\.[^.]+$/, "")));
      if (!film) {
        out[i] = { name: file.name, state: "nomatch", detail: "Ninguna película se llama así" };
      } else {
        const up = await uploadPoster(file);
        if (!up.ok) out[i] = { name: file.name, state: "error", film: film.title, detail: up.error };
        else {
          const res = await setPosterAction(film.id, up.url);
          out[i] = res.ok ? { name: file.name, state: "ok", film: film.title } : { name: file.name, state: "error", film: film.title, detail: res.error };
        }
      }
      setLines([...out]);
    }
    setBusy(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button className="btn-outline" onClick={() => setOpen(true)}>
        <ImagePlus className="h-4 w-4" /> Subir pósters en lote
      </button>
    );
  }

  const ok = lines.filter((l) => l.state === "ok").length;
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">Pósters en lote</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Suelta varias imágenes a la vez. Cada archivo debe llamarse como la película (por ejemplo <span className="font-mono text-[13px]">la-llorona.jpg</span> para «La Llorona»). Se optimizan solas.
          </p>
        </div>
        <button className="text-muted hover:text-ink" aria-label="Cerrar" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) void run([...e.dataTransfer.files]);
        }}
        className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm text-muted transition-colors ${over ? "border-accent bg-accent/10" : "border-line"}`}
      >
        <ImagePlus className="h-6 w-6" />
        <span>Arrastra las imágenes aquí o</span>
        <button className="btn-outline" disabled={busy} onClick={() => input.current?.click()}>
          Elegir archivos
        </button>
        <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => void run([...(e.target.files ?? [])])} />
      </div>

      {lines.length > 0 && (
        <div className="mt-4">
          <p className="text-sm">
            {busy ? "Subiendo…" : `Listo: ${ok} de ${lines.length} pósters asignados.`}
          </p>
          <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-sm">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center gap-2">
                {l.state === "working" && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
                {l.state === "ok" && <CheckCircle2 className="h-4 w-4 text-ok" />}
                {(l.state === "nomatch" || l.state === "error") && <TriangleAlert className="h-4 w-4 text-warn" />}
                <span className="font-mono text-[13px]">{l.name}</span>
                {l.film && <span className="text-muted">→ {l.film}</span>}
                {l.detail && <span className="text-muted">· {l.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
