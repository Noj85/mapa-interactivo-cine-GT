import { SettingsNav } from "@/components/admin/SettingsNav";
import { adminStore } from "@/lib/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const store = await adminStore();
  // si el catálogo todavía no existe (migración 0008 sin aplicar), la sección sale sin número
  const festivals = await store.searchFestivals("", { limit: 1 }).then((r) => r.total).catch(() => null);
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Ajustes</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <SettingsNav counts={{ festivales: festivals }} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
