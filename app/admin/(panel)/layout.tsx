import { AdminNav } from "@/components/admin/AdminNav";
import { adminStore, requireSession } from "@/lib/auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const pendingSubmissions = await (await adminStore())
    .listSubmissions({ status: "pending" })
    .then((l) => l.length)
    .catch(() => 0);
  return (
    <div className="min-h-dvh bg-bg">
      <AdminNav email={session.email} pendingSubmissions={pendingSubmissions} />
      {session.mode === "local" && (
        <div className="border-b border-line bg-surface-2/60 px-4 py-1.5 text-center text-xs text-muted">
          Modo local: los datos se guardan en <code>.data/db.json</code>. Conecta Supabase para publicar en línea.
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
