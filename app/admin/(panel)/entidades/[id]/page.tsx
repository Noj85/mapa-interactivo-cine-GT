import Link from "next/link";
import { notFound } from "next/navigation";
import { OrgEditor } from "@/components/admin/OrgEditor";
import { RequestsPanel } from "@/components/admin/RequestsPanel";
import { adminStore } from "@/lib/auth";

export default async function EditOrg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await adminStore();
  const org = await store.getOrg(id);
  if (!org) notFound();
  const requests = await store.listInfoRequests({ kind: "org", target_id: id }).catch(() => []);
  return (
    <div>
      <Link href="/admin/entidades" className="text-sm text-muted hover:text-ink">← Entidades</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">{org.name}</h1>
      <OrgEditor key={org.id + org.completeness} org={org} />
      <RequestsPanel kind="org" id={org.id} title={org.name} requests={requests} />
    </div>
  );
}
