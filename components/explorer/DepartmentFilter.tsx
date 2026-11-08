"use client";

import { Check, ChevronDown, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { cn } from "@/lib/utils";

const MENU_W = 272;

/**
 * Desplegable con casillas para ver uno o varios departamentos a la vez: acerca la cámara a lo elegido,
 * atenúa el resto del país y recorta las listas y cifras a esos departamentos.
 */
export function DepartmentFilter({
  gaz,
  selected,
  onChange,
  compact,
}: {
  gaz: Gazetteer;
  /** Códigos INE de los departamentos marcados. */
  selected: number[];
  onChange(codes: number[]): void;
  /** Teléfono: solo el ícono del lugar. */
  compact?: boolean;
}) {
  const deptos = useMemo(
    () =>
      gaz.entries
        .filter((e) => e.type === "depto")
        .map((e) => ({ code: e.code, name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [gaz],
  );
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const active = selected.length > 0;

  const label =
    selected.length === 0
      ? "Todo el país"
      : selected.length === 1
        ? (deptos.find((d) => d.code === selected[0])?.name ?? "1 departamento")
        : `${selected.length} departamentos`;

  const toggleMenu = () => {
    if (open) return setOpen(false);
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8));
      setPos({ left, top: r.bottom + 6, maxHeight: Math.max(220, Math.min(480, window.innerHeight - r.bottom - 20)) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (code: number) => onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  const menuEl =
    open && pos
      ? createPortal(
          <div
            ref={menu}
            role="group"
            aria-label="Departamentos"
            className="glass fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-line shadow-float"
            style={{ width: MENU_W, left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
              <span className="text-xs font-medium text-muted">{active ? `${selected.length} de ${deptos.length} departamentos` : "Elige uno o varios"}</span>
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={!active}
                className="rounded-md px-1.5 py-1 text-xs font-medium text-accent transition-opacity hover:underline disabled:pointer-events-none disabled:opacity-40"
              >
                Todo el país
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              {deptos.map((d) => {
                const on = selected.includes(d.code);
                return (
                  <button
                    key={d.code}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(d.code)}
                    className={cn("flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-surface-2", on ? "text-ink" : "text-muted")}
                  >
                    <span
                      className={cn(
                        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                        on ? "border-accent bg-accent text-white" : "border-muted/50",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1">{d.name}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  if (compact)
    return (
      <>
        <button
          ref={btn}
          type="button"
          onClick={toggleMenu}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Filtrar el mapa por departamento: ${label}`}
          className={cn(
            "pointer-events-auto glass relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-soft transition-colors",
            active ? "border-accent/60 text-accent" : "border-line text-muted",
          )}
        >
          <MapPin className="h-5 w-5" aria-hidden />
          {active && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums text-white" aria-hidden>
              {selected.length}
            </span>
          )}
        </button>
        {menuEl}
      </>
    );

  return (
    <div
      className={cn(
        "pointer-events-auto glass flex w-fit max-w-full items-center gap-1 rounded-2xl border p-1 shadow-soft transition-colors",
        active ? "border-accent/60" : "border-line",
      )}
    >
      <button
        ref={btn}
        type="button"
        onClick={toggleMenu}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Filtrar el mapa por departamento: ${label}`}
        className="flex h-9 min-w-0 items-center gap-2 rounded-xl pl-3 pr-2.5 text-sm font-medium text-ink outline-none transition-colors hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <MapPin className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-muted")} aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {active && (
        <button type="button" className="btn-ghost h-9 w-9 !p-0" onClick={() => onChange([])} aria-label="Quitar el filtro de departamento" title="Ver todo el país">
          <X className="h-4 w-4" />
        </button>
      )}
      {menuEl}
    </div>
  );
}
