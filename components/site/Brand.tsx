import { cn } from "@/lib/utils";

/**
 * Logos institucionales. Cada uno tiene una variante para fondo claro y otra para fondo oscuro;
 * se alterna con el tema de la interfaz (ver scripts/brand.mjs, que las genera en public/brand/).
 */
function ThemedLogo({ name, alt, className, width, height }: { name: string; alt: string; className?: string; width: number; height: number }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/${name}-light.png`} alt={alt} width={width} height={height} className={cn("block w-auto dark:hidden", className)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/${name}-dark.png`} alt="" aria-hidden width={width} height={height} className={cn("hidden w-auto dark:block", className)} />
    </>
  );
}

/** Sello de la Academia (la cinta de película), sin texto. */
export function BrandMark({ className }: { className?: string }) {
  return <ThemedLogo name="academia-mark" alt="Academia Guatemalteca de Artes y Ciencias Cinematográficas" width={303} height={164} className={cn("h-9 shrink-0", className)} />;
}

/** Logo completo de la Academia (sello + nombre). */
export function AcademiaLogo({ className }: { className?: string }) {
  return <ThemedLogo name="academia" alt="Academia Guatemalteca de Artes y Ciencias Cinematográficas" width={626} height={164} className={cn("h-10", className)} />;
}

export function ProcineLogo({ className }: { className?: string }) {
  return <ThemedLogo name="procine" alt="PROCINE" width={1193} height={302} className={cn("h-8", className)} />;
}

export function BrandName({ compact }: { compact?: boolean }) {
  return (
    <span className="min-w-0 leading-tight">
      <span className="line-clamp-2 block font-display text-[15px] font-semibold leading-[1.15] tracking-tight text-ink sm:line-clamp-1">Mapa del Cine de Guatemala</span>
      {!compact && <span className="mt-0.5 hidden truncate text-[11px] uppercase tracking-[0.08em] text-muted sm:block">Academia de Cine de Guatemala</span>}
    </span>
  );
}

/** Pie institucional: Academia + PROCINE. */
export function BrandFooter({ className, bare }: { className?: string; bare?: boolean }) {
  return (
    <footer className={cn(!bare && "border-t border-line", className)}>
      <div className={cn("flex flex-wrap items-center gap-x-8 gap-y-4", !bare && "mx-auto max-w-6xl px-4 py-8")}>
        <AcademiaLogo className="h-11" />
        <span className="hidden h-8 w-px bg-line sm:block" aria-hidden />
        <ProcineLogo className="h-9" />
        {!bare && (
          <p className="max-w-sm text-xs leading-relaxed text-muted sm:ml-auto">
            Mapa del Cine de Guatemala. Datos abiertos del cine nacional, mantenidos por el equipo de la Academia.
          </p>
        )}
      </div>
    </footer>
  );
}
