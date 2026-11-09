import Link from "next/link";
import { PersonEditor } from "@/components/admin/PersonEditor";

export default function NewPerson() {
  return (
    <div>
      <Link href="/admin/agregar" className="text-sm text-muted hover:text-ink">← Agregar datos</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">Nueva persona</h1>
      <PersonEditor />
    </div>
  );
}
