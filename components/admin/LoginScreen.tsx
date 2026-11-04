import Link from "next/link";
import { AcademiaLogo, ProcineLogo } from "@/components/site/Brand";
import { LocalLogin, SupabaseLogin } from "@/app/admin/_auth/LoginForm";
import { localOpenAccess } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";

/** Acceso del equipo. Se muestra en /admin cuando no hay sesión (no existe una ruta /login aparte). */
export function LoginScreen() {
  const sb = supabaseConfigured();
  const noPassword = !sb && !process.env.ADMIN_PASSWORD && !localOpenAccess();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <AcademiaLogo className="mb-5 h-14" />
          <h1 className="font-display text-3xl tracking-tight">Equipo de la Academia</h1>
          <p className="mt-2 text-sm text-muted">Entra para cargar y completar la información del mapa.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-soft">
          {noPassword ? (
            <p className="text-sm text-muted">
              Define la variable <code className="kbd">ADMIN_PASSWORD</code> (o conecta Supabase) para habilitar el acceso del equipo.
            </p>
          ) : sb ? (
            <SupabaseLogin />
          ) : (
            <LocalLogin />
          )}
          {sb && (
            <p className="mt-4 text-xs text-muted/80">
              Solo las personas autorizadas por la Academia pueden editar. Si no tienes acceso, escribe a contacto@academiadecinegt.org.
            </p>
          )}
        </div>
        <Link href="/" className="mt-6 block text-center text-sm text-muted hover:text-ink">
          ← Ir al mapa público
        </Link>
        <div className="mt-8 flex justify-center border-t border-line pt-6">
          <ProcineLogo className="h-7" />
        </div>
      </div>
    </main>
  );
}
