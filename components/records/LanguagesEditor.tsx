"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { cleanLanguages, LANGUAGES, MAX_LANGUAGE_LENGTH, MAX_LANGUAGES, splitLanguageText } from "@/lib/crew";
import { cn, normalize } from "@/lib/utils";

/**
 * Idiomas de la producción: los estándar (incluidos idiomas mayas, garífuna y xinka) para marcar con un toque
 * y un campo para escribir otros. Hasta 8 en total. Mismo diseño que los géneros.
 */
export function LanguagesEditor({ languages, onChange }: { languages: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  const chosen = new Set(languages.map(normalize));
  const standard = new Set(LANGUAGES.map(normalize));
  const custom = languages.filter((l) => !standard.has(normalize(l)));
  const full = languages.length >= MAX_LANGUAGES;

  const toggle = (l: string) => {
    if (chosen.has(normalize(l))) onChange(languages.filter((x) => normalize(x) !== normalize(l)));
    else if (!full) onChange(cleanLanguages([...languages, l]));
  };

  const addText = (raw: string) => {
    const parts = splitLanguageText(raw);
    if (parts.length) onChange(cleanLanguages([...languages, ...parts]));
    setText("");
  };

  return (
    <section aria-label="Idiomas">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Idiomas ({languages.length}/{MAX_LANGUAGES})</h2>
      </div>
      <p className="mb-2 text-xs leading-relaxed text-muted">Los idiomas que se hablan en la producción. Marca los que apliquen; si falta alguno, escríbelo abajo.</p>
      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((l) => {
          const on = chosen.has(normalize(l));
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(l)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                on ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-muted/60 hover:text-ink",
              )}
            >
              {l}
            </button>
          );
        })}
      </div>

      {custom.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {custom.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-md border border-accent bg-accent/10 py-1 pl-2.5 pr-1 text-xs font-medium text-ink">
              {l}
              <button type="button" aria-label={`Quitar ${l}`} className="rounded p-0.5 text-muted hover:text-ink" onClick={() => toggle(l)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className="field"
          maxLength={MAX_LANGUAGE_LENGTH * 4}
          placeholder="Otro idioma (Enter o coma para agregar)"
          aria-label="Otro idioma"
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
      {full && <p className="mt-1.5 text-xs text-muted">Llegaste al máximo de {MAX_LANGUAGES} idiomas.</p>}
    </section>
  );
}
