"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { cleanGenres, GENRES, MAX_GENRE_LENGTH, MAX_GENRES, splitGenreText } from "@/lib/film-types";
import { cn, normalize } from "@/lib/utils";

/**
 * Géneros de la producción: los estándar de festivales para marcar con un toque
 * y un campo para escribir otros («Realismo mágico»). Hasta 8 en total.
 */
export function GenresEditor({ genres, onChange }: { genres: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  const chosen = new Set(genres.map(normalize));
  const standard = new Set(GENRES.map(normalize));
  const custom = genres.filter((g) => !standard.has(normalize(g)));
  const full = genres.length >= MAX_GENRES;

  const toggle = (g: string) => {
    if (chosen.has(normalize(g))) onChange(genres.filter((x) => normalize(x) !== normalize(g)));
    else if (!full) onChange(cleanGenres([...genres, g]));
  };

  const addText = (raw: string) => {
    const parts = splitGenreText(raw);
    if (parts.length) onChange(cleanGenres([...genres, ...parts]));
    setText("");
  };

  return (
    <section aria-label="Géneros">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Géneros ({genres.length}/{MAX_GENRES})</h2>
      </div>
      <p className="mb-2 text-xs leading-relaxed text-muted">Marca los que apliquen. Si falta alguno, escríbelo abajo.</p>
      <div className="flex flex-wrap gap-1.5">
        {GENRES.map((g) => {
          const on = chosen.has(normalize(g));
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(g)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                on ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-muted/60 hover:text-ink",
              )}
            >
              {g}
            </button>
          );
        })}
      </div>

      {custom.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {custom.map((g) => (
            <span key={g} className="inline-flex items-center gap-1 rounded-md border border-accent bg-accent/10 py-1 pl-2.5 pr-1 text-xs font-medium text-ink">
              {g}
              <button type="button" aria-label={`Quitar ${g}`} className="rounded p-0.5 text-muted hover:text-ink" onClick={() => toggle(g)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className="field"
          maxLength={MAX_GENRE_LENGTH * 4}
          placeholder="Otro género (Enter o coma para agregar)"
          aria-label="Otro género"
          disabled={full}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]$/.test(v)) addText(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addText(text);
            }
          }}
          onBlur={() => text.trim() && addText(text)}
        />
        <button type="button" className="btn-outline !px-3 text-xs" disabled={full || !text.trim()} onClick={() => addText(text)}>
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>
      {full && <p className="mt-1.5 text-xs text-muted">Llegaste al máximo de {MAX_GENRES} géneros.</p>}
    </section>
  );
}
