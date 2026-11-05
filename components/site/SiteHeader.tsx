import { Download, HandHeart, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { BrandMark, BrandName, ProcineLogo } from "./Brand";

const links = [
  { href: "/", label: "Mapa", icon: MapIcon },
  { href: "/descargas", label: "Descargas", icon: Download },
  { href: "/aportar", label: "Aportar", icon: HandHeart },
];

/** Encabezado de las páginas de contenido (descargas, etc.). El mapa tiene su propia barra flotante. */
export function SiteHeader({ current }: { current: "/" | "/descargas" | "/aportar" | "/creditos" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Mapa del Cine de Guatemala, inicio">
          <BrandMark />
          <BrandName />
        </Link>
        <div className="ml-auto hidden md:block">
          <ProcineLogo className="h-6" />
        </div>
        <span className="hidden h-6 w-px bg-line md:block" aria-hidden />
        <nav className="flex items-center gap-1 max-md:ml-auto" aria-label="Principal">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              aria-label={l.label}
              title={l.label}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                l.href === "/aportar"
                  ? "bg-brand text-brand-ink shadow-sm hover:brightness-110"
                  : current === l.href
                    ? "bg-surface-2 text-ink"
                    : "text-muted hover:text-ink",
              )}
            >
              <l.icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{l.label}</span>
            </Link>
          ))}
          <ThemeToggle />

        </nav>
      </div>
    </header>
  );
}
