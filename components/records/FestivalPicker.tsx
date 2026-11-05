"use client";

import { BadgeCheck, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
  country: string | null;
  city: string | null;
}

/**
 * Nombre de festival con sugerencias del catálogo. Se puede elegir uno conocido (queda enlazado
 * y trae país y ciudad) o escribir cualquier otro: el campo nunca restringe a la lista.
 */
export function FestivalPicker({
  id,
  name,
  festivalId,
  onChange,
}: {
  id: string;
  name: string;
  festivalId: string | null;
  onChange: (v: { name: string; festival_id: string | null; country?: string; city?: string }) => void;
}) {
  const listId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // sugerencias con una pequeña espera para no pedir en cada tecla
  useEffect(() => {
    const q = name.trim();
    if (q.length < 2 || festivalId) {
      setItems([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/festivales?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { items?: Item[] };
        if (n === seq.current) {
          setItems(j.items ?? []);
          setActive(-1);
        }
      } catch {
        if (n === seq.current) setItems([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [name, festivalId]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (it: Item) => {
    onChange({ name: it.name, festival_id: it.id, country: it.country ?? "", city: it.city ?? "" });
    setItems([]);
    setOpen(false);
  };

  const show = open && items.length > 0;
  const trimmed = name.trim();

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        className="field"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={300}
        placeholder="Escribe el nombre del festival"
        value={name}
        onChange={(e) => {
          // al editar el texto, deja de estar enlazado al catálogo
          onChange({ name: e.target.value, festival_id: null });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {show && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {items.map((it, i) => (
            <li
              key={it.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer px-3 py-2 text-sm", i === active && "bg-surface-2")}
            >
              <span className="block">{it.name}</span>
              {(it.city || it.country) && <span className="block text-xs text-muted">{[it.city, it.country].filter(Boolean).join(", ")}</span>}
            </li>
          ))}
        </ul>
      )}
      {trimmed && (
        <p className={cn("mt-1 flex items-center gap-1 text-[11px]", festivalId ? "text-ok" : "text-muted")}>
          {festivalId ? (
            <>
              <BadgeCheck className="h-3 w-3" /> Festival del catálogo
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" /> Festival nuevo: se revisará al aprobar el aporte
            </>
          )}
        </p>
      )}
    </div>
  );
}
