import Link from "next/link";
import { ImportWizard } from "@/components/import/ImportWizard";
import { claudeEnabled } from "@/lib/claude/client";

export const maxDuration = 60;

export default function CargarPage() {
  return (
    <div>
      <Link href="/admin/agregar" className="text-sm text-muted hover:text-ink">← Agregar datos</Link>
      <h1 className="font-display text-4xl tracking-tight">Cargar archivo</h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        Sube un Excel, CSV o PDF con películas, locaciones o entidades. {claudeEnabled() ? "Claude analiza el archivo y organiza la información." : "Sin clave de Claude configurada: usamos reconocimiento básico de columnas y de PDF con tablas o fichas."}
      </p>
      <ImportWizard />
    </div>
  );
}
