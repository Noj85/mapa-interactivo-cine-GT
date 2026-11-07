"use client";

import { Download, HandHeart, MoreHorizontal, Moon, Search, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MapLogo } from "@/components/site/Brand";

/**
 * Barra superior del teléfono para el público: el logo, «Aportar» siempre a mano, un menú con lo secundario
 * (descargas y tema) y, debajo, una barra de búsqueda grande que se lee como un campo de texto.
 */
export function MobileTopBar({
  homeHref,
  onHome,
  aportarHref,
  onSearch,
  theme,
  onTheme,
}: {
  homeHref: string;
  /** Clic en el logo: vuelve a la vista inicial. */
  onHome(e: React.MouseEvent): void;
  aportarHref: string;
  onSearch(): void;
  theme: "light" | "dark";
  onTheme(): void;
}) {
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);

  const item = "flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-ink transition-colors hover:bg-surface-2";
  return (
    <>
      <div ref={root} className="pointer-events-auto glass relative flex items-center gap-2 rounded-2xl border border-line p-2 shadow-soft">
        <h1 className="m-0 flex min-w-0 flex-1 items-center pl-1.5">
          <a href={homeHref} onClick={onHome} className="flex min-w-0 items-center" aria-label="Mapa del Cine de Guatemala, inicio" title="Ir al inicio">
            <MapLogo className="h-9 max-w-full object-contain object-left" />
          </a>
        </h1>
        <Link href={aportarHref} className="btn-primary h-10 shrink-0 gap-1.5 px-3.5" title="Aporta una producción o entidad que falta en el mapa">
          <HandHeart className="h-4 w-4" aria-hidden />
          Aportar
        </Link>
        <button className="btn-ghost h-10 w-10 shrink-0 !p-0" aria-label="Más opciones" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((o) => !o)}>
          <MoreHorizontal className="h-5 w-5" />
        </button>
        {menu && (
          <div role="menu" className="glass absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-line p-1 shadow-float">
            <Link role="menuitem" href="/descargas" className={item}>
              <Download className="h-4 w-4 text-muted" aria-hidden /> Descargas de datos
            </Link>
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                onTheme();
                setMenu(false);
              }}
            >
              {theme === "dark" ? <Sun className="h-4 w-4 text-muted" aria-hidden /> : <Moon className="h-4 w-4 text-muted" aria-hidden />}
              {theme === "dark" ? "Modo claro" : "Modo oscuro"}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="pointer-events-auto glass flex h-11 w-full items-center gap-2.5 rounded-2xl border border-line px-4 text-left text-[15px] text-muted shadow-soft transition-colors active:bg-surface-2"
        aria-label="Buscar un lugar, producción o entidad"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Buscar un lugar o producción</span>
      </button>
    </>
  );
}
