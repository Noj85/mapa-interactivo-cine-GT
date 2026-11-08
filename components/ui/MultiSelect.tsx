"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, normalize } from "@/lib/utils";

export interface Option<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  /** Título bajo el que se agrupa (las opciones del mismo grupo deben ir seguidas). */
  group?: string;
}

interface MenuPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Selector múltiple con búsqueda; se maneja con teclado y se cierra con Escape o al hacer clic fuera.
 * El menú se pinta aparte (en `document.body`, posición fija) para que ningún contenedor con `overflow` lo corte;
 * se abre hacia arriba si abajo no hay espacio y sigue al botón al hacer scroll o cambiar el tamaño de la ventana.
 */
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
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const margin = 12;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const up = below < 220 && above > below;
    const width = Math.min(r.width, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    setPos(
      up
        ? { left, width, bottom: window.innerHeight - r.top + gap, maxHeight: Math.max(160, above - gap) }
        : { left, width, top: r.bottom + gap, maxHeight: Math.max(160, below - gap) },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
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
        ref={button}
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
      {open && pos && createPortal(
        <div
          ref={menu}
          data-floating-menu
          className="fixed z-[70] flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-float"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          {searchable && (
            <div className="relative border-b border-line">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input autoFocus className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted/70" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <ul role="listbox" aria-multiselectable aria-label={label} className="min-h-0 flex-1 overflow-auto py-1">
            {shown.map((o, i) => {
              const on = value.includes(o.value);
              const heading = o.group && o.group !== shown[i - 1]?.group;
              return (
                <Fragment key={String(o.value)}>
                  {heading && (
                    <li role="presentation" className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      {o.group}
                    </li>
                  )}
                <li role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                  </button>
                </li>
                </Fragment>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">Sin resultados</li>}
          </ul>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="w-full border-t border-line px-3 py-2 text-left text-xs text-muted hover:text-ink">
              Quitar selección
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
