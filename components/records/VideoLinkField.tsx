"use client";

import { Loader2, Play, X } from "lucide-react";
import { useRef, useState } from "react";
import { posterThumb } from "@/lib/poster-url";
import { parseVideo } from "@/lib/video-url";

type Status = "idle" | "loading" | "found" | "none" | "error";

/**
 * Enlace de un video (tráiler o película completa). Al salir del campo busca la miniatura en la plataforma
 * (YouTube, Vimeo u otras que la publiquen) y la guarda; si no hay miniatura, el enlace se guarda igual.
 */
export function VideoLinkField({
  id,
  label,
  hint,
  url,
  thumb,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  url: string;
  thumb: string | null;
  onChange: (patch: { url: string; thumb: string | null }) => void;
}) {
  const [status, setStatus] = useState<Status>(thumb ? "found" : "idle");
  const [error, setError] = useState<string | null>(null);
  const checked = useRef(url.trim());
  const seq = useRef(0);
  const parsed = parseVideo(url);

  async function check() {
    const link = url.trim();
    if (!link) {
      checked.current = "";
      setStatus("idle");
      setError(null);
      return;
    }
    if (link === checked.current && (thumb || status === "none")) return;
    if (!parseVideo(link)) {
      setStatus("error");
      setError("El enlace no parece válido. Pega la dirección completa del video.");
      return;
    }
    checked.current = link;
    const mine = ++seq.current;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/videos/miniatura", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link }) });
      const data = (await res.json()) as { ok?: boolean; url?: string | null; error?: string };
      if (mine !== seq.current) return;
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? "No pudimos revisar el enlace; se guardará sin miniatura.");
        return;
      }
      onChange({ url, thumb: data.url ?? null });
      setStatus(data.url ? "found" : "none");
    } catch {
      if (mine !== seq.current) return;
      setStatus("error");
      setError("No pudimos revisar el enlace; se guardará sin miniatura.");
    }
  }

  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          className="field min-w-0 flex-1"
          type="url"
          inputMode="url"
          maxLength={500}
          placeholder="https://"
          value={url}
          onChange={(e) => {
            seq.current++;
            setStatus("idle");
            setError(null);
            // al cambiar el enlace, la miniatura anterior ya no corresponde
            onChange({ url: e.target.value, thumb: null });
          }}
          onBlur={check}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void check();
            }
          }}
        />
        {url && (
          <button type="button" className="btn-ghost h-10 w-10 shrink-0 !p-0" aria-label={`Quitar ${label.toLowerCase()}`} onClick={() => {
            seq.current++;
            checked.current = "";
            setStatus("idle");
            setError(null);
            onChange({ url: "", thumb: null });
          }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {status === "loading" && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Buscando la miniatura…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-warn" role="alert">{error}</p>}
      {thumb && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-line p-2">
          <span className="relative block aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterThumb(thumb)!} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"><Play className="h-3.5 w-3.5 translate-x-px" aria-hidden /></span>
            </span>
          </span>
          <span className="min-w-0 text-xs text-muted">
            Miniatura de <span className="text-ink">{parsed?.label ?? "la plataforma"}</span>
          </span>
        </div>
      )}
      {status === "none" && !thumb && parsed && (
        <p className="mt-2 text-xs text-muted">{parsed.label} no publica una miniatura para este enlace. Sin miniatura: el enlace se guarda igual.</p>
      )}
    </div>
  );
}
