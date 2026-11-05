"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const MIN = 10;

/** Elegir o cambiar la contraseña. Exige sesión (llega con ella desde el enlace del correo). */
export function NewPasswordForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < MIN) return setError(`Usa al menos ${MIN} caracteres.`);
    if (pw !== again) return setError("Las dos contraseñas no coinciden.");
    setBusy(true);
    const { error } = await createBrowserSupabase().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setError(/different|same/i.test(error.message) ? "La contraseña nueva debe ser distinta de la actual." : "No pudimos guardar la contraseña. Pide un enlace nuevo e inténtalo otra vez.");
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/admin");
      router.refresh();
    }, 1200);
  };

  if (done) return <p className="text-sm text-ok">Listo, tu contraseña quedó guardada. Te llevamos al panel…</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="np1">Contraseña nueva</label>
        <input id="np1" type="password" required minLength={MIN} autoComplete="new-password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} />
        <p className="mt-1 text-xs text-muted">Al menos {MIN} caracteres.</p>
      </div>
      <div>
        <label className="label" htmlFor="np2">Repítela</label>
        <input id="np2" type="password" required autoComplete="new-password" className="field" value={again} onChange={(e) => setAgain(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar contraseña
      </button>
    </form>
  );
}
