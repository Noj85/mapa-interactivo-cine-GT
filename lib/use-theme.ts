"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Theme } from "@/lib/map/colors";

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** Tema actual (claro u oscuro), sincronizado entre todos los componentes de la página. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const toggle = useCallback(() => {
    const next: Theme = read() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }, []);
  return [theme, toggle];
}
