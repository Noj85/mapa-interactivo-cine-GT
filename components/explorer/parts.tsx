"use client";

import { categoriesText } from "@/lib/categories";
import { PosterImage } from "@/components/ui/PosterImage";
import { posterThumb } from "@/lib/poster-url";
import { ArrowLeft, Check, ChevronDown, Clapperboard, Download, Landmark, X } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isAbroad, isUnlocated } from "@/lib/completeness";
import type { Aggregates } from "@/lib/aggregate";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { durationLabel, filmTypeLabel } from "@/lib/film-types";
import type { Dataset, Film, LayerId, Org } from "@/lib/types";
import type { PublicStats, StatKey } from "@/lib/site-settings";
import type { Place, ViewState } from "@/lib/view";
import { cn } from "@/lib/utils";
import { CompletenessBadge } from "@/components/ui/Badges";

export interface PanelCtx {
  data: Dataset;
  gaz: Gazetteer;
  aggs: Aggregates;
  view: ViewState;
  /** El usuario tiene sesión de equipo: muestra acciones de edición. */
  canEdit?: boolean;
  /** Todas las producciones publicadas, sin filtrar (para los conteos y el aviso de las que no se muestran). */
  allFilms: Film[];
  /** Teléfono: hoja inferior con la lista compacta. */
  mobile?: boolean;
  /** Altura de la hoja inferior en el teléfono. */
  sheet?: "peek" | "half" | "full";
  go: {
    place(p: Place | null): void;
    deptos(codes: number[]): void;
    film(slug: string): void;
    org(slug: string): void;
    unlocated(): void;
    abroad(): void;
    layer(l: LayerId): void;
    up(): void;
    clear(): void;
    /** Filtro público de producciones: con o sin locación registrada (null: todas). */
    locacion(v: "con" | "sin" | null): void;
  };
}

type Locacion = "con" | "sin" | null;

const LOCACION_LABEL: Record<"con" | "sin" | "todas", string> = { con: "Con locación", sin: "Sin locación", todas: "Todas" };

/** Chip compacto con menú de una sola elección. Lo usa el filtro público de locación. */
function MenuChip({
  value,
  defaultId,
  options,
  ariaLabel,
  onChange,
  className,
  prefix,
}: {
  value: string;
  /** Opción normal: el chip se ve en gris; con otra se resalta. */
  defaultId: string;
  options: { id: string; label: string; count: number }[];
  ariaLabel: string;
  onChange(id: string): void;
  className?: string;
  /** Texto antes de la opción elegida, por ejemplo «Origen:». */
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value) ?? options[0];
  const MENU_W = 232;

  const toggle = () => {
    if (open) return setOpen(false);
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8));
      // el menú sale por fuera de la hoja (portal), hacia abajo o hacia arriba según haya espacio
      setPos(r.bottom + options.length * 44 + 24 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
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

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
          current.id === defaultId ? "border-line bg-surface-2/60 text-ink hover:border-muted/60" : "border-accent/60 bg-accent/10 text-accent",
        )}
      >
        {prefix && <span className="text-muted">{prefix}</span>}
        {current.label}
        <span className="tabular-nums text-muted">{current.count}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={ariaLabel}
            className="glass fixed z-[60] overflow-hidden rounded-xl border border-line p-1 shadow-float"
            style={{ width: MENU_W, left: pos.left, top: pos.top, bottom: pos.bottom }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={current.id === o.id}
                onClick={() => {
                  setOpen(false);
                  onChange(o.id);
                }}
                className={cn("flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors hover:bg-surface-2", current.id === o.id ? "text-ink" : "text-muted")}
              >
                <Check className={cn("h-4 w-4 shrink-0 text-accent", current.id === o.id ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="flex-1">{o.label}</span>
                <span className="text-xs tabular-nums text-muted">{o.count}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Chip compacto con menú para elegir qué producciones se ven: con locación (lo normal), sin locación o todas.
 * Cada opción trae su conteo. Afecta a la lista y al mapa.
 */
export function LocacionChip({
  value,
  counts,
  onChange,
  options = ["con", "sin", "todas"],
  className,
}: {
  value: Locacion;
  counts: { con: number; sin: number; todas: number };
  onChange(v: Locacion): void;
  options?: ("con" | "sin" | "todas")[];
  className?: string;
}) {
  return (
    <MenuChip
      value={value ?? "todas"}
      defaultId="con"
      ariaLabel="Qué producciones ver"
      className={className}
      options={options.map((o) => ({ id: o, label: LOCACION_LABEL[o], count: counts[o] }))}
      onChange={(id) => onChange(id === "todas" ? null : (id as "con" | "sin"))}
    />
  );
}

/** Conteos para el chip de locación, sobre todas las producciones publicadas (sin filtrar). */
export function locacionCounts(films: Pick<Film, "locations">[]) {
  const sin = films.filter(isUnlocated).length;
  return { con: films.length - sin, sin, todas: films.length };
}

export function PanelShell({
  children,
  onClose,
  onBack,
  eyebrow,
}: {
  children: ReactNode;
  onClose?: () => void;
  onBack?: () => void;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <button className="btn-ghost -ml-2 h-8 w-8 shrink-0 !p-0" onClick={onBack} aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{eyebrow}</div>
        </div>
        {onClose && (
          <button className="btn-ghost -mr-2 h-8 w-8 shrink-0 !p-0" onClick={onClose} aria-label="Cerrar panel">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-surface-2/40 px-3.5 py-3">
      <div className="font-display text-[26px] leading-none tracking-tight text-ink">{value}</div>
      <div className="mt-1.5 text-xs text-muted">{label}</div>
      {sub && <div className="text-[11px] text-muted/70">{sub}</div>}
    </div>
  );
}

export interface StatItem {
  key: StatKey;
  label: string;
  value: ReactNode;
  /** Solo para el equipo: en cuántas producciones hay dato, p. ej. «dato en 12 de 80». */
  coverage?: string;
}

/**
 * Las cifras de producción que el equipo decidió mostrar (Ajustes → Cifras públicas). El público ve solo las encendidas
 * (y nada si no hay ninguna); el equipo ve todas, con las apagadas marcadas y un enlace a Ajustes.
 */
export function StatsGrid({ items, stats, canEdit, className }: { items: StatItem[]; stats: PublicStats; canEdit?: boolean; className?: string }) {
  const shown = canEdit ? items : items.filter((i) => stats[i.key]);
  if (!shown.length) return null;
  const hidden = canEdit && shown.some((i) => !stats[i.key]);
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2.5">
        {shown.map((i) => (
          <div key={i.key} className={cn(canEdit && !stats[i.key] && "opacity-60")}>
            <Stat label={i.label} value={i.value} sub={[canEdit && !stats[i.key] ? "Oculta al público" : null, canEdit ? i.coverage : null].filter(Boolean).join(" · ") || undefined} />
          </div>
        ))}
      </div>
      {hidden && (
        <Link href="/admin/ajustes/cifras" className="mt-2 inline-block text-xs text-accent underline underline-offset-2">
          Elegir qué cifras ve el público
        </Link>
      )}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-baseline justify-between">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{children}</h3>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}

export function BarRow({
  label,
  sub,
  value,
  text,
  max,
  onClick,
}: {
  label: string;
  sub?: string;
  value: number;
  text: string;
  max: number;
  onClick?: () => void;
}) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2"
    >
      <span
        className="absolute inset-y-1 left-0 rounded-r-lg bg-accent/15 transition-all group-hover:bg-accent/25"
        style={{ width: `${pct}%` }}
      />
      <span className="relative min-w-0 truncate text-sm text-ink">
        {label}
        {sub && <span className="ml-1.5 text-xs text-muted">{sub}</span>}
      </span>
      <span className="relative shrink-0 text-xs font-medium tabular-nums text-accent">{text}</span>
    </button>
  );
}

export function FilmCard({
  film,
  gaz,
  hereMuni,
  hereDepto,
  onClick,
  hideBadge,
}: {
  film: Film;
  gaz: Gazetteer;
  hereMuni?: number;
  hereDepto?: number;
  onClick: () => void;
  /** Teléfono: sin la insignia de completitud, para no recargar la lista. */
  hideBadge?: boolean;
}) {
  const kind = filmTypeLabel(film);
  const here = film.locations.filter((l) =>
    hereMuni != null ? l.muni_ine === hereMuni : hereDepto != null ? (l.depto_ine ?? 0) === hereDepto : false,
  );
  const sites = (here.length ? here : film.locations)
    .map((l) => (isAbroad(l) ? [l.city, l.country].filter(Boolean).join(", ") : l.site ?? gaz.muni(l.muni_ine)?.name ?? gaz.depto(l.depto_ine)?.name))
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[48px] w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition hover:border-line hover:bg-surface-2/70"
    >
      {film.poster_url ? (
        <PosterImage src={film.poster_url} heightClass="h-14" maxWidthClass="max-w-[5.5rem]" className="mt-0.5 rounded-md bg-surface-2 ring-1 ring-line" />
      ) : (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
          <Clapperboard className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] text-ink">{film.title}</span>
        <span className="block truncate text-xs text-muted">
          {[film.year, kind, durationLabel(film.duration_min)].filter(Boolean).join(" · ") || "Sin datos básicos"}
          {sites ? ` — ${sites}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {film.nationality === "extranjera" && <span className="chip !py-0 text-[11px] border-accent/50 text-accent">Producción extranjera</span>}
          {film.locations.length > 1 && (
            <span className="chip !py-0 text-[11px]">{film.locations.length} locaciones</span>
          )}
          {film.genres.slice(0, 2).map((g) => (
            <span key={g} className="chip !py-0 text-[11px]">{g}</span>
          ))}
          {film.genres.length > 2 && <span className="text-[11px] text-muted">+{film.genres.length - 2}</span>}
          {!hideBadge && <CompletenessBadge pct={film.completeness} missing={film.missing_fields} compact />}
        </span>
      </span>
    </button>
  );
}

/**
 * Logo de una entidad (miniatura sobre fondo claro, porque los logos suelen tener transparencia);
 * sin logo, el ícono de siempre. El tamaño y el redondeo los pone quien lo usa.
 */
export function OrgLogo({ org, className, full }: { org: Pick<Org, "name" | "logo_url">; className?: string; full?: boolean }) {
  if (!org.logo_url)
    return (
      <span className={cn("flex shrink-0 items-center justify-center bg-accent/12 text-accent", className)}>
        <Landmark className="h-[45%] w-[45%]" />
      </span>
    );
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-line", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={(full ? org.logo_url : posterThumb(org.logo_url)) ?? org.logo_url}
        alt={`Logo de ${org.name}`}
        loading="lazy"
        className="h-full w-full object-contain p-[8%]"
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (org.logo_url && img.src !== org.logo_url) img.src = org.logo_url;
        }}
      />
    </span>
  );
}

export function OrgCard({ org, gaz, onClick, hideBadge }: { org: Org; gaz: Gazetteer; onClick: () => void; hideBadge?: boolean }) {
  const place = gaz.muni(org.muni_ine)?.name ?? gaz.depto(org.depto_ine)?.name ?? org.city;
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[48px] w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition hover:border-line hover:bg-surface-2/70"
    >
      <OrgLogo org={org} className="mt-0.5 h-9 w-9 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] text-ink">{org.name}</span>
        <span className="block truncate text-xs text-muted">
          {categoriesText(org)}
          {place ? ` — ${place}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {!hideBadge && <CompletenessBadge pct={org.completeness} missing={org.missing_fields} compact />}
        </span>
      </span>
    </button>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted", className)}>
      {children}
    </div>
  );
}

/** Lleva a la página de descargas con los filtros del mapa ya puestos. */
export function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn-outline mt-5 w-full text-xs">
      <Download className="h-3.5 w-3.5" /> {label}
    </Link>
  );
}
