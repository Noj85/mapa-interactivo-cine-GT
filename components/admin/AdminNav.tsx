"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Database, Globe, Inbox, LayoutDashboard, LogOut, Map as MapIcon, PlusCircle, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/admin/_auth/actions";

/** Rutas de alta: pertenecen a «Agregar datos», aunque cuelguen de /peliculas o /entidades. */
const ADD_ROUTES = ["/admin/agregar", "/admin/cargar", "/admin/peliculas/nueva", "/admin/entidades/nueva"];
const isAdd = (p: string) => ADD_ROUTES.some((r) => p === r || p.startsWith(`${r}/`));

const items = [
  { href: "/admin", label: "Mapa", icon: MapIcon, isActive: (p: string) => p === "/admin" },
  { href: "/admin/resumen", label: "Resumen", icon: LayoutDashboard, isActive: (p: string) => p.startsWith("/admin/resumen") },
  { href: "/admin/aportes", label: "Aportes", icon: Inbox, badge: true, isActive: (p: string) => p.startsWith("/admin/aportes") },
  { href: "/admin/agregar", label: "Agregar datos", icon: PlusCircle, isActive: isAdd },
  {
    href: "/admin/peliculas",
    label: "Registros",
    icon: Database,
    isActive: (p: string) => (p.startsWith("/admin/peliculas") || p.startsWith("/admin/entidades")) && !isAdd(p),
  },
];

export function AdminNav({ email, pendingSubmissions = 0 }: { email: string; pendingSubmissions?: number }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line border-t-2 border-t-accent bg-bg/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/admin" className="mr-3 flex shrink-0 items-center" aria-label="Consola de administración, inicio" title="Consola de administración">
          <span className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-ink sm:block">
            <span className="hidden xl:inline">Consola de administración</span>
            <span className="xl:hidden">Administración</span>
          </span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {items.map((it) => {
            const active = it.isActive(path);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-label={it.label}
                title={it.label}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
                )}
              >
                <it.icon className="h-4 w-4" aria-hidden />
                <span className="hidden md:inline">{it.label}</span>
                {"badge" in it && it.badge && pendingSubmissions > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink"
                    aria-label={`${pendingSubmissions} pendientes`}
                  >
                    {pendingSubmissions}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
        <Link
          href="/admin/ajustes"
          aria-label="Ajustes"
          title="Ajustes"
          aria-current={path.startsWith("/admin/ajustes") ? "page" : undefined}
          className={cn("btn-ghost h-9 gap-1.5 px-2.5 text-xs xl:px-3", path.startsWith("/admin/ajustes") && "bg-surface-2 text-ink")}
        >
          <Settings className="h-4 w-4" /> <span className="hidden xl:inline">Ajustes</span>
        </Link>
        <Link href="/" className="btn-ghost h-9 gap-1.5 px-2.5 text-xs xl:px-3" aria-label="Vista pública" title="Vista pública">
          <Globe className="h-4 w-4" /> <span className="hidden xl:inline">Vista pública</span>
        </Link>
        <span className="hidden text-xs text-muted lg:block">{email}</span>
        <form action={logoutAction}>
          <button className="btn-ghost h-9 w-9 !p-0" aria-label="Salir" title="Salir">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
