"use client";

import { posterThumb } from "@/lib/poster-url";
import { ArrowLeft, Clapperboard, Download, Landmark, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Aggregates } from "@/lib/aggregate";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { FILM_KINDS, type Dataset, type Film, type LayerId, type Org } from "@/lib/types";
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
  go: {
    place(p: Place | null): void;
    film(slug: string): void;
    org(slug: string): void;
    unlocated(): void;
    layer(l: LayerId): void;
    up(): void;
    clear(): void;
  };
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
}: {
  film: Film;
  gaz: Gazetteer;
  hereMuni?: number;
  hereDepto?: number;
  onClick: () => void;
}) {
  const kind = FILM_KINDS.find((k) => k.id === film.kind)?.label;
  const here = film.locations.filter((l) =>
    hereMuni != null ? l.muni_ine === hereMuni : hereDepto != null ? (l.depto_ine ?? 0) === hereDepto : false,
  );
  const sites = (here.length ? here : film.locations)
    .map((l) => l.site ?? gaz.muni(l.muni_ine)?.name ?? gaz.depto(l.depto_ine)?.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition hover:border-line hover:bg-surface-2/70"
    >
      {film.poster_url ? (
        <span className="mt-0.5 block h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2 ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterThumb(film.poster_url)!} alt="" loading="lazy" className="h-full w-full object-cover" />
        </span>
      ) : (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
          <Clapperboard className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] text-ink">{film.title}</span>
        <span className="block truncate text-xs text-muted">
          {[film.year, kind].filter(Boolean).join(" · ") || "Sin datos básicos"}
          {sites ? ` — ${sites}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {film.locations.length > 1 && (
            <span className="chip !py-0 text-[11px]">{film.locations.length} locaciones</span>
          )}
          <CompletenessBadge pct={film.completeness} missing={film.missing_fields} compact />
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

export function OrgCard({ org, gaz, onClick }: { org: Org; gaz: Gazetteer; onClick: () => void }) {
  const place = gaz.muni(org.muni_ine)?.name ?? gaz.depto(org.depto_ine)?.name ?? org.city;
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition hover:border-line hover:bg-surface-2/70"
    >
      <OrgLogo org={org} className="mt-0.5 h-9 w-9 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] text-ink">{org.name}</span>
        <span className="block truncate text-xs text-muted">
          {org.category}
          {place ? ` — ${place}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <CompletenessBadge pct={org.completeness} missing={org.missing_fields} compact />
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
