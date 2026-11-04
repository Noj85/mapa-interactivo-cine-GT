"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const label = theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  return (
    <button className={cn("btn-ghost h-9 w-9 !p-0", className)} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
