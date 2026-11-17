import Link from "next/link";
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

/**
 * Logo del Mapa del Cine de Guatemala: cinta de película con el pin y el nombre escrito en Montserrat. Con `markOnly` solo la cinta y el pin.
 * Tiene variantes para fondo claro y oscuro (ver scripts/brand-mapa.mjs para la marca y scripts/brand-mapa-logo.mjs para el logo completo).
 */
export function MapLogo({ className, markOnly }: { className?: string; markOnly?: boolean }) {
  return markOnly ? (
    <ThemedLogo name="mapa-mark" alt="Mapa del Cine de Guatemala" width={657} height={355} className={cn("h-9 shrink-0", className)} />
  ) : (
    <ThemedLogo name="mapa-logo" alt="Mapa del Cine de Guatemala" width={3700} height={710} className={cn("h-10 shrink-0", className)} />
  );
}

/** Logo completo de la Academia (sello + nombre). */
export function AcademiaLogo({ className }: { className?: string }) {
  return <ThemedLogo name="academia" alt="Academia Guatemalteca de Artes y Ciencias Cinematográficas" width={626} height={164} className={cn("h-10", className)} />;
}

export function ProcineLogo({ className }: { className?: string }) {
  return <ThemedLogo name="procine" alt="PROCINE" width={1193} height={302} className={cn("h-8", className)} />;
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
            Mapa del Cine de Guatemala. Datos abiertos del cine nacional, mantenidos por la Academia Guatemalteca de Artes y Ciencias Cinematográficas.
          </p>
        )}
        <Link href="/creditos" className={cn("w-full text-xs text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-accent", !bare && "sm:w-auto")}>
          Créditos y licencias
        </Link>
        <p className="w-full text-xs leading-relaxed text-muted">
          Datos: investigación de Alberto Jiménez (Redccapfa) y de la Comisión de Investigación y Preservación de PROCINE 2025.{" "}
          <Link href="/creditos" className="underline decoration-line underline-offset-2 hover:text-ink hover:decoration-accent">
            Ver créditos
          </Link>
        </p>
      </div>
    </footer>
  );
}
