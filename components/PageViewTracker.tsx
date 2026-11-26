"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/track";

/** Cuenta una página vista cada vez que cambia la ruta pública (el mapa y sus filtros cuentan como «/»). */
export function PageViewTracker() {
  const path = usePathname();
  useEffect(() => {
    if (path) track("view", null, path);
  }, [path]);
  return null;
}
