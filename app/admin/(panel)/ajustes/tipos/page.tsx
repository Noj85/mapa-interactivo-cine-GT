import { NumberTypesCleanup } from "@/components/admin/NumberTypesCleanup";
import { adminStore } from "@/lib/auth";
import { typeCards } from "@/lib/type-cleanup";

export default async function TiposPage() {
  const store = await adminStore();
  const [films, submissions] = await Promise.all([store.listFilms({ drafts: true }), store.listSubmissions().catch(() => [])]);
  const cards = typeCards(films, submissions);

  return (
    <div>
      <h2 className="font-display text-2xl tracking-tight">Tipos de número</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Días de rodaje y empleos se guardan como enteros. Aquí se ven los que ya quedaron como texto o con decimales, en producciones o en aportes, para dejarlos bien de una vez.
      </p>
      <div className="mt-6">
        <NumberTypesCleanup cards={cards} />
      </div>
    </div>
  );
}
