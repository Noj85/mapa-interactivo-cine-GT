import type { Metadata } from "next";
import { LoginScreen } from "@/components/admin/LoginScreen";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Administración · Mapa del Cine de Guatemala",
  // el área del equipo no debe aparecer en buscadores
  robots: { index: false, follow: false, nocache: true },
};

/** Todo lo que cuelga de /admin exige sesión; sin ella se muestra el acceso del equipo en la misma dirección. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}
