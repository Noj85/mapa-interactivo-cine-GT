import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonEditor } from "@/components/admin/PersonEditor";
import { adminStore } from "@/lib/auth";
import { normalize } from "@/lib/utils";

export default async function EditPerson({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await adminStore();
  const person = await store.getPerson(id);
  if (!person) notFound();
  const people = await store.listPeople({ drafts: true }).catch(() => []);
  const duplicates = people
    .filter((p) => p.id !== person.id && normalize(p.name) === normalize(person.name))
    .map((p) => ({ id: p.id, name: p.name }));
  return (
    <div>
      <Link href="/admin/personas" className="text-sm text-muted hover:text-ink">← Personas</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">{person.name}</h1>
      <PersonEditor key={person.id + person.completeness} person={person} duplicates={duplicates} />
    </div>
  );
}
