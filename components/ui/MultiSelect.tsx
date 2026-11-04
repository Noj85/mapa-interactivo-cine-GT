"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn, normalize } from "@/lib/utils";

export interface Option<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/** Selector múltiple con búsqueda; se maneja con teclado y se cierra con Escape o al hacer clic fuera. */
export function MultiSelect<T extends string | number>({
  label,
  placeholder,
  options,
  value,
  onChange,
  searchable,
}: {
  label: string;
  placeholder: string;
  options: Option<T>[];
  value: T[];
  onChange(v: T[]): void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const shown = useMemo(() => {
    const n = normalize(q);
    return n ? options.filter((o) => normalize(o.label).includes(n)) : options;
  }, [options, q]);

  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value.map((v) => options.find((o) => o.value === v)?.label ?? String(v)).join(", ")
        : `${value.length} seleccionados`;

  return (
    <div ref={root} className="relative">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("field flex items-center justify-between gap-2 text-left", value.length === 0 && "text-muted")}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-lg border border-line bg-surface shadow-float">
          {searchable && (
            <div className="relative border-b border-line">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input autoFocus className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted/70" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <ul role="listbox" aria-multiselectable aria-label={label} className="max-h-64 overflow-auto py-1">
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <li key={String(o.value)} role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">Sin resultados</li>}
          </ul>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="w-full border-t border-line px-3 py-2 text-left text-xs text-muted hover:text-ink">
              Quitar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}
