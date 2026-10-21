"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getPersistenceMode } from "@/lib/persistence/mode";
import { FavoriteDestinations } from "@/features/account/components/favorite-destinations";
import { ProfilePreferencesForm } from "@/features/account/components/profile-preferences-form";
import { DeviceTripImport } from "@/features/trips/components/device-trip-import";
import { setVisitorLocalMode } from "@/lib/persistence/mode";
import { getAuthCallbackUrl } from "@/lib/supabase/auth-redirect";

type AuthAction = "signin" | "signup";
type AuthFormState = {
  email: string;
  password: string;
  message: string;
  error: string;
  loading: boolean;
};

const emptyAuthForm: AuthFormState = {
  email: "",
  password: "",
  message: "",
  error: "",
  loading: false,
};

function safeAuthErrorMessage(error: unknown, action: "signin" | "signup" | "resend"): string {
  const candidate = typeof error === "object" && error !== null
    ? error as { code?: unknown; status?: unknown; message?: unknown }
    : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  if (action === "signin" && (code === "invalid_credentials" || message.includes("invalid login credentials"))) {
    return "No se pudo iniciar sesión. Comprueba las credenciales o, si esperas una confirmación, solicita el reenvío del correo.";
  }
  if (action === "signin" && (code === "email_not_confirmed" || message.includes("email not confirmed"))) {
    return "El acceso requiere confirmar el correo. Puedes solicitar el reenvío desde este formulario.";
  }
  if (action === "signup" && ["user_already_exists", "email_exists"].includes(code)) {
    return "No se pudo completar la solicitud. Prueba a iniciar sesión o a solicitar el reenvío de confirmación; no podemos determinar desde aquí el estado de una cuenta.";
  }

  const diagnostics = [
    code ? `código ${code}` : "",
    typeof candidate.status === "number" ? `HTTP ${candidate.status}` : "",
  ].filter(Boolean).join(", ");
  const operation = action === "signin" ? "el inicio de sesión" : action === "signup" ? "el registro" : "el reenvío del correo";
  return `Supabase no pudo completar ${operation}${diagnostics ? ` (${diagnostics})` : ""}. Revisa los registros de Auth en Supabase; este mensaje no confirma la existencia de una cuenta ni la entrega de un correo.`;
}

export default function AccountPage() {
  const router = useRouter();
  const [authForms, setAuthForms] = useState<Record<AuthAction, AuthFormState>>({
    signin: { ...emptyAuthForm },
    signup: { ...emptyAuthForm },
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const authEventReceivedRef = useRef(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"access" | "preferences" | "favorites">("access");
  const supabaseMode = getPersistenceMode() === "supabase";
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const requestedTab = url.searchParams.get("tab");
    if (requestedTab === "preferences" || requestedTab === "favorites") setActiveTab(requestedTab);
    const authResult = url.searchParams.get("auth");
    let statusUpdate: number | undefined;
    if (authResult === "confirmed") {
      statusUpdate = window.setTimeout(() => setMessage("Correo confirmado. Ya puedes iniciar sesión."), 0);
      window.history.replaceState(null, "", url.pathname);
    } else if (authResult === "confirmation_error") {
      statusUpdate = window.setTimeout(() => setError("No se pudo confirmar el correo. El enlace puede haber caducado; solicita un nuevo correo de confirmación."), 0);
      window.history.replaceState(null, "", url.pathname);
    }
    return () => {
      if (statusUpdate !== undefined) window.clearTimeout(statusUpdate);
    };
  }, []);

  useEffect(() => {
    if (!supabaseMode || !supabaseConfigured) return;
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;
    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!isMounted || authEventReceivedRef.current || userError) return;
      setSignedInEmail(data.user?.email ?? null);
      setVisitorLocalMode(!data.user);
    }).catch(() => {
      // Keep the current UI state when auth state cannot be read; do not
      // downgrade an active session or visitor preference on a transient error.
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceivedRef.current = true;
      setSignedInEmail(session?.user.email ?? null);
      setVisitorLocalMode(!session?.user);
    });
    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabaseConfigured, supabaseMode]);

  const updateAuthForm = (action: AuthAction, updates: Partial<AuthFormState>) => {
    setAuthForms((current) => ({
      ...current,
      [action]: { ...current[action], ...updates },
    }));
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>, action: AuthAction) => {
    event.preventDefault();
    const credentials = authForms[action];
    updateAuthForm(action, { error: "", message: "", loading: true });
    setError("");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const result = action === "signin"
        ? await supabase.auth.signInWithPassword({ email: credentials.email, password: credentials.password })
        : await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
          options: {
            emailRedirectTo: getAuthCallbackUrl(window.location.origin, process.env.NEXT_PUBLIC_SITE_URL, {
              environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
              url: process.env.NEXT_PUBLIC_VERCEL_URL,
              productionUrl: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
            }),
          },
        });
      if (result.error) throw result.error;
      authEventReceivedRef.current = true;
      setSignedInEmail(result.data.session?.user.email ?? null);
      setVisitorLocalMode(!result.data.session?.user);
      updateAuthForm(action, {
        message: action === "signup" && !result.data.session
          ? "Solicitud recibida. Si el registro está disponible para este correo, revisa tu bandeja y spam. Si ya tienes una cuenta, inicia sesión o solicita el reenvío. No podemos confirmar desde aquí la existencia de la cuenta ni la entrega del correo."
          : action === "signin"
            ? "Sesión iniciada. Tus datos privados se guardarán en Supabase."
            : "Sesión iniciada. Tus datos privados se guardarán en Supabase.",
      });
    } catch (authError) {
      updateAuthForm(action, {
        error: safeAuthErrorMessage(authError, action),
      });
    } finally {
      updateAuthForm(action, { loading: false });
    }
  };

  const handleResendConfirmation = async () => {
    const email = authForms.signin.email.trim();
    if (!email) {
      updateAuthForm("signin", { error: "Escribe el correo en el formulario de inicio de sesión para solicitar un reenvío." });
      return;
    }
    updateAuthForm("signin", { error: "", message: "", loading: true });
    try {
      const { error: resendError } = await createSupabaseBrowserClient().auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: getAuthCallbackUrl(window.location.origin, process.env.NEXT_PUBLIC_SITE_URL, {
            environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
            url: process.env.NEXT_PUBLIC_VERCEL_URL,
            productionUrl: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
          }),
        },
      });
      if (resendError) throw resendError;
      updateAuthForm("signin", {
        message: "Solicitud procesada. Si hay una confirmación pendiente para este correo, revisa tu bandeja y spam. Supabase no confirma desde aquí la existencia de la cuenta ni la entrega del mensaje.",
      });
    } catch (resendError) {
      updateAuthForm("signin", { error: safeAuthErrorMessage(resendError, "resend") });
    } finally {
      updateAuthForm("signin", { loading: false });
    }
  };

  const handleSignOut = async () => {
    setError("");
    setMessage("");
    try {
      const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      setSignedInEmail(null);
      setVisitorLocalMode(true);
      setMessage("Sesión cerrada.");
      router.replace("/");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "No se pudo cerrar la sesión.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Cuenta</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Acceso a tus viajes</h1>
        </div>
        <Link href="/" className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">Inicio</Link>
      </div>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Secciones de Cuenta">
        {([
          ["access", "Acceso"],
          ["preferences", "Preferencias de viaje"],
          ["favorites", "Destinos favoritos"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => {
              setActiveTab(tab);
              const url = new URL(window.location.href);
              if (tab === "access") url.searchParams.delete("tab");
              else url.searchParams.set("tab", tab);
              window.history.replaceState(null, "", `${url.pathname}${url.search}`);
            }}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold ${activeTab === tab ? "border-emerald-800 bg-emerald-800 text-white" : "border-slate-300 bg-white text-slate-800"}`}
          >{label}</button>
        ))}
      </nav>
      {activeTab === "access" && <>
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
                  <input type="email" required autoComplete={action === "signin" ? "username" : "email"} value={authForms[action].email} onChange={(event) => updateAuthForm(action, { email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                <label className="block text-sm">Contraseña
                  <input type="password" required minLength={8} autoComplete={action === "signin" ? "current-password" : "new-password"} value={authForms[action].password} onChange={(event) => updateAuthForm(action, { password: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
                </label>
                {authForms[action].message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{authForms[action].message}</p>}
                {authForms[action].error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{authForms[action].error}</p>}
                <button disabled={authForms[action].loading} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {authForms[action].loading ? "Procesando..." : action === "signin" ? "Entrar" : "Registrarme"}
                </button>
                {action === "signin" && <button
                  type="button"
                  disabled={authForms.signin.loading}
                  onClick={() => void handleResendConfirmation()}
                  className="ml-3 text-sm font-semibold text-emerald-800 underline disabled:opacity-50"
                >Reenviar confirmación</button>}
              </form>
            ))}
          </div>
        )}
        {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p>}
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      </section>
      {signedInEmail && supabaseMode && supabaseConfigured && <DeviceTripImport />}
      </>}
      {activeTab === "preferences" && <section className="mt-6 min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label="Preferencias de viaje">
        <details onToggle={(event) => setPreferencesOpen(event.currentTarget.open)} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <summary className="cursor-pointer text-lg font-semibold text-slate-900">Preferencias de viaje</summary>
          <p className="my-4 text-sm leading-relaxed text-slate-600">Configura moneda, intereses, ritmo y tipos de viaje. Se usarán como valores iniciales al planificar.</p>
          {preferencesOpen && (signedInEmail || !supabaseMode
            ? <ProfilePreferencesForm />
            : <p className="my-4 text-sm text-slate-600">Inicia sesión para consultar o modificar las preferencias privadas de tu cuenta.</p>)}
        </details>
      </section>}
      {activeTab === "favorites" && <section className="mt-6 min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label="Destinos favoritos">
        <details onToggle={(event) => setFavoritesOpen(event.currentTarget.open)} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <summary className="cursor-pointer text-lg font-semibold text-slate-900">Destinos favoritos</summary>
          <p className="my-4 text-sm leading-relaxed text-slate-600">Los favoritos guardados también siguen disponibles en el selector de destinos.</p>
          {favoritesOpen && <FavoriteDestinations />}
        </details>
      </section>}
    </main>
  );
}
