import Link from "next/link";
import { NewPasswordForm } from "@/components/admin/NewPasswordForm";
import { AcademiaLogo } from "@/components/site/Brand";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Elegir una contraseña nueva. Está dentro de /admin, así que sin sesión se ve el acceso del equipo:
 * el enlace del correo (/auth/callback) abre la sesión y deja a la persona aquí.
 */
export default async function RestablecerPage() {
  const session = await getSession();
  const supabase = session?.mode === "supabase";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <AcademiaLogo className="mb-5 h-14" />
          <h1 className="font-display text-3xl tracking-tight">Elige tu contraseña</h1>
          <p className="mt-2 text-sm text-muted">{session?.email}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-soft">
          {supabase ? (
            <NewPasswordForm />
          ) : (
            <p className="text-sm text-muted">Este acceso usa una contraseña única definida por quien administra el servidor; no se cambia desde aquí.</p>
          )}
        </div>
        <Link href="/admin" className="mt-6 block text-center text-sm text-muted hover:text-ink">
          ← Volver al panel
        </Link>
      </div>
    </main>
  );
}
