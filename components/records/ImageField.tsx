"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { posterThumb } from "@/lib/poster-url";
import { cn } from "@/lib/utils";

export type ImageKind = "poster" | "logo";
/** `team`: el equipo sube directo al almacenamiento (5 MB). `public`: aporte del público (3 MB, con límite por IP). */
export type ImageAudience = "team" | "public";

const LIMITS: Record<ImageAudience, number> = { team: 5, public: 3 };

/** Sube un archivo al servidor y devuelve la URL de la imagen ya optimizada. */
export async function uploadImage(
  file: File,
  kind: ImageKind,
  audience: ImageAudience,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const mb = LIMITS[audience];
  if (file.size > mb * 1024 * 1024) return { ok: false, error: `La imagen pesa más de ${mb} MB.` };
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  try {
    const res = await fetch(audience === "public" ? "/api/aportes/imagen" : "/api/posters", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error ?? "No se pudo subir la imagen." };
    return { ok: true, url: json.url };
  } catch {
    return { ok: false, error: "No hay conexión. Inténtalo de nuevo." };
  }
}

const COPY = {
  poster: { label: "Póster", alt: "Póster de la producción", frame: "aspect-[2/3] max-w-[200px]", fit: "object-cover" },
  logo: { label: "Logo", alt: "Logo de la entidad", frame: "aspect-square max-w-[160px]", fit: "object-contain p-3" },
} as const;

/** Imagen de una producción (póster) o de una entidad (logo). Igual para el equipo y para el público. */
export function ImageField({
  kind,
  audience = "team",
  value,
  onChange,
}: {
  kind: ImageKind;
  audience?: ImageAudience;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = COPY[kind];

  const take = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    const res = await uploadImage(file, kind, audience);
    setBusy(false);
    if (res.ok) onChange(res.url);
    else setError(res.error);
  };

  return (
    <div>
      <span className="label">{c.label}</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-line text-center transition-colors",
          kind === "logo" ? "bg-white" : "bg-surface-2",
          c.frame,
          over && "border-accent bg-accent/10",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterThumb(value) ?? value}
            alt={c.alt}
            className={cn("h-full w-full", c.fit)}
            onError={(e) => ((e.currentTarget as HTMLImageElement).src = value)}
          />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn("flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-xs hover:text-ink", kind === "logo" ? "text-neutral-500" : "text-muted")}
          >
            <ImagePlus className="h-6 w-6" />
            Arrastra una imagen o haz clic
            <span className="text-[11px] opacity-70">JPG, PNG o WebP · hasta {LIMITS[audience]} MB</span>
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/70">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>
      {value && (
        <div className="mt-2 flex gap-3 text-xs">
          <button type="button" className="text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => input.current?.click()}>
            Reemplazar
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-danger" onClick={() => onChange(null)}>
            <X className="h-3 w-3" /> Quitar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
