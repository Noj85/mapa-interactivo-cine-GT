import Link from "next/link";
import { OrgEditor } from "@/components/admin/OrgEditor";

export default function NewOrg() {
  return (
    <div>
      <Link href="/admin/agregar" className="text-sm text-muted hover:text-ink">← Agregar datos</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">Nueva entidad</h1>
      <OrgEditor />
    </div>
  );
}
