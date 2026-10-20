"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { getPersistenceMode } from "@/app/lib/persistence/mode";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const supabaseMode = getPersistenceMode() === "supabase";
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  useEffect(() => {
    if (!supabaseMode || !supabaseConfigured) return;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => setSignedInEmail(data.user?.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInEmail(session?.user.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabaseConfigured, supabaseMode]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>, action: "signin" | "signup") => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const result = action === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      setSignedInEmail(result.data.user?.email ?? null);
      setMessage(action === "signup" && !result.data.session
        ? "Cuenta creada. Confirma el correo y vuelve para iniciar sesión."
        : "Sesión iniciada. Tus datos privados se guardarán en Supabase.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "No se pudo completar la autenticación.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError("");
    setMessage("");
    try {
      const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      setSignedInEmail(null);
      setMessage("Sesión cerrada.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "No se pudo cerrar la sesión.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Cuenta</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Acceso a tus viajes</h1>
        </div>
        <Link href="/" className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">Inicio</Link>
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {!supabaseMode ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p>La aplicación está en modo demo. Los cambios se guardan solo en el almacenamiento local de este navegador.</p>
            <p>Para cuentas y sincronización privada, configura Supabase y establece <code>NEXT_PUBLIC_DATA_MODE=supabase</code>.</p>
          </div>
        ) : !supabaseConfigured ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">
            Supabase está seleccionado pero faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Configúralas y reinicia Next.js.
          </p>
        ) : signedInEmail ? (
          <div className="space-y-4">
            <p>Sesión iniciada como <strong>{signedInEmail}</strong>.</p>
            <button onClick={handleSignOut} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Cerrar sesión</button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <p className="text-base leading-relaxed text-slate-600 md:col-span-2">Crea una cuenta o inicia sesión. Supabase Auth protege los datos de cada usuario.</p>
            {(["signin", "signup"] as const).map((action) => (
              <form key={action} onSubmit={(event) => void handleAuth(event, action)} className="space-y-3">
                <h2 className="font-semibold">{action === "signin" ? "Iniciar sesión" : "Crear cuenta"}</h2>
                <label className="block text-sm">Correo
                  <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <label className="block text-sm">Contraseña
                  <input type="password" required minLength={8} autoComplete={action === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <button disabled={loading} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {loading ? "Procesando..." : action === "signin" ? "Entrar" : "Registrarme"}
                </button>
              </form>
            ))}
          </div>
        )}
        {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p>}
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      </section>
    </main>
  );
}
