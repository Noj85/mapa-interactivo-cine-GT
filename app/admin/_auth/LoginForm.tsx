"use client";

import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { localLoginAction } from "./actions";

export function SupabaseLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = createBrowserSupabase();
    if (mode === "password") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: "error", text: "Correo o contraseña incorrectos." });
      else {
        router.push("/admin");
        router.refresh();
      }
    } else {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMsg({ kind: "error", text: "No pudimos enviar el enlace. Revisa el correo." });
      else setMsg({ kind: "ok", text: "Listo. Revisa tu correo y abre el enlace para entrar." });
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Correo del equipo</label>
        <input id="email" type="email" required autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode === "password" && (
        <div>
          <label className="label" htmlFor="pw">Contraseña</label>
          <input id="pw" type="password" required autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      )}
      {msg && <p className={msg.kind === "ok" ? "text-sm text-ok" : "text-sm text-danger"}>{msg.text}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "link" ? <Mail className="h-4 w-4" /> : null}
        {mode === "password" ? "Entrar" : "Enviarme un enlace"}
      </button>
      <button type="button" className="w-full text-center text-xs text-muted hover:text-ink" onClick={() => setMode(mode === "password" ? "link" : "password")}>
        {mode === "password" ? "Prefiero entrar con un enlace por correo" : "Prefiero usar contraseña"}
      </button>
    </form>
  );
}

export function LocalLogin() {
  const [state, action, pending] = useActionState(localLoginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Contraseña del equipo</label>
        <input id="password" name="password" type="password" required className="field" autoFocus />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
      </button>
    </form>
  );
}
