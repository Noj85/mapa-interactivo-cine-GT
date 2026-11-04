import { AlertCircle, CheckCircle2 } from "lucide-react";
import { completenessTone } from "@/lib/completeness";
import { cn } from "@/lib/utils";

export function CompletenessBadge({
  pct,
  missing,
  compact,
}: {
  pct: number;
  missing?: string[];
  compact?: boolean;
}) {
  if (pct >= 100) {
    return compact ? null : (
      <span className="chip border-ok/40 text-ok">
        <CheckCircle2 className="h-3 w-3" /> Completa
      </span>
    );
  }
  const tone = completenessTone(pct);
  return (
    <span
      title={missing?.length ? `Falta: ${missing.join(", ")}` : undefined}
      className={cn(
        "chip",
        tone === "ok" && "border-ok/40 text-ok",
        tone === "warn" && "border-warn/45 text-warn",
        tone === "danger" && "border-danger/45 text-danger",
      )}
    >
      <AlertCircle className="h-3 w-3" />
      {compact ? `${pct}%` : `Incompleta · ${pct}%`}
    </span>
  );
}

export function CompletenessMeter({ pct }: { pct: number }) {
  const tone = completenessTone(pct);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/60">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          tone === "ok" && "bg-ok",
          tone === "warn" && "bg-warn",
          tone === "danger" && "bg-danger",
        )}
        style={{ width: `${Math.max(4, pct)}%` }}
      />
    </div>
  );
}
