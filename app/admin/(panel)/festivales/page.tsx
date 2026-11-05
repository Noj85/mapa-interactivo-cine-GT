import { redirect } from "next/navigation";

/** El catálogo de festivales ahora vive en Ajustes; este enlace queda por si alguien lo guardó. */
export default async function FestivalesRedirect({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.p ? { p: sp.p } : {}) }).toString();
  redirect(`/admin/ajustes/festivales${qs ? `?${qs}` : ""}`);
}
