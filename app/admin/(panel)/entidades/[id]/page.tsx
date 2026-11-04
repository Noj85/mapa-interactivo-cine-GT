import Link from "next/link";
import { notFound } from "next/navigation";
import { OrgEditor } from "@/components/admin/OrgEditor";
import { adminStore } from "@/lib/auth";

export default async function EditOrg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await (await adminStore()).getOrg(id);
  if (!org) notFound();
  return (
    <div>
      <Link href="/admin/entidades" className="text-sm text-muted hover:text-ink">← Entidades</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">{org.name}</h1>
      <OrgEditor key={org.id + org.completeness} org={org} />
    </div>
  );
}
