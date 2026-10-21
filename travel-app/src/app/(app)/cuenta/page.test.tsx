import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthCallbackUrl } from "@/lib/supabase/auth-redirect";

const {
  signInWithPasswordMock,
  signUpMock,
  resendMock,
  getUserMock,
  onAuthStateChangeMock,
  unsubscribeMock,
  replaceMock,
} = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
  resendMock: vi.fn(),
  getUserMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      resend: resendMock,
      getUser: getUserMock,
      onAuthStateChange: onAuthStateChangeMock,
      signOut: vi.fn(),
    },
  }),
}));

import AccountPage from "@/app/(app)/cuenta/page";

function getAuthForm(title: string): HTMLFormElement {
  const form = screen.getByRole("heading", { name: title }).closest("form");
  if (!(form instanceof HTMLFormElement)) throw new Error(`Form not found: ${title}`);
  return form;
}

function setCredentials(form: HTMLFormElement, email: string, password = "clave-prueba-123") {
  const scoped = within(form);
  fireEvent.change(scoped.getByLabelText("Correo"), { target: { value: email } });
  fireEvent.change(scoped.getByLabelText("Contraseña"), { target: { value: password } });
}

describe("autenticación de Cuenta", () => {
  beforeEach(() => {
    localStorage.removeItem("viajes.storage-mode.v1");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://viajes.example.com");
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: unsubscribeMock } } });
    signInWithPasswordMock.mockReset();
    signUpMock.mockReset();
    resendMock.mockReset();
    replaceMock.mockReset();
    window.history.replaceState(null, "", "/cuenta");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mantiene formularios independientes y no revela el estado de una cuenta ante credenciales inválidas", async () => {
    signInWithPasswordMock.mockResolvedValue({ error: new Error("Invalid login credentials") });
    signUpMock.mockResolvedValue({ error: null, data: { user: { id: "opaque-user" }, session: null } });
    render(<AccountPage />);

    expect(screen.getByText("Preferencias de viaje")).toBeInTheDocument();
    expect(screen.getByText("Destinos favoritos")).toBeInTheDocument();
    const signInForm = getAuthForm("Iniciar sesión");
    const signUpForm = getAuthForm("Crear cuenta");
    setCredentials(signInForm, "acceso@example.com");
    setCredentials(signUpForm, "registro@example.com");

    fireEvent.click(within(signInForm).getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "acceso@example.com",
      password: "clave-prueba-123",
    }));
    expect(within(signInForm).getByRole("alert")).toHaveTextContent("No se pudo iniciar sesión");
    expect(within(signInForm).getByRole("alert")).not.toHaveTextContent("cuenta existe");
    expect(within(signUpForm).queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(within(signUpForm).getByRole("button", { name: "Registrarme" }));
    await waitFor(() => expect(signUpMock).toHaveBeenCalledWith({
      email: "registro@example.com",
      password: "clave-prueba-123",
      options: { emailRedirectTo: getAuthCallbackUrl(window.location.origin, "https://viajes.example.com") },
    }));
    expect(within(signUpForm).getByRole("status")).toHaveTextContent("Solicitud recibida");
    expect(within(signUpForm).getByRole("status")).not.toHaveTextContent("Cuenta creada");
    expect(within(signUpForm).getByRole("status")).not.toHaveTextContent("correo enviado");
    expect(within(signInForm).getByRole("alert")).toBeInTheDocument();
  });

  it("inicia sesión con credenciales válidas y activa el almacenamiento de cuenta", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: null,
      data: { user: { id: "account-1", email: "ana@example.com" }, session: { user: { id: "account-1", email: "ana@example.com" } } },
    });
    render(<AccountPage />);

    const form = getAuthForm("Iniciar sesión");
    setCredentials(form, "ana@example.com");
    fireEvent.click(within(form).getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
  });

  it("acepta un registro que devuelve sesión inmediata", async () => {
    signUpMock.mockResolvedValue({
      error: null,
      data: { user: { id: "account-2", email: "ana@example.com" }, session: { user: { id: "account-2", email: "ana@example.com" } } },
    });
    render(<AccountPage />);

    const form = getAuthForm("Crear cuenta");
    setCredentials(form, "ana@example.com");
    fireEvent.click(within(form).getByRole("button", { name: "Registrarme" }));

    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
  });

  it("permite reenviar la confirmación sin volver a registrar la cuenta", async () => {
    resendMock.mockResolvedValue({ error: null });
    render(<AccountPage />);

    const form = getAuthForm("Iniciar sesión");
    fireEvent.change(within(form).getByLabelText("Correo"), { target: { value: "ana@example.com" } });
    fireEvent.click(within(form).getByRole("button", { name: "Reenviar confirmación" }));

    await waitFor(() => expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "ana@example.com",
      options: { emailRedirectTo: getAuthCallbackUrl(window.location.origin, "https://viajes.example.com") },
    }));
    expect(within(form).getByRole("status")).toHaveTextContent("Solicitud procesada");
    expect(within(form).getByRole("status")).not.toHaveTextContent("correo enviado");
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("muestra diagnósticos de proveedor seguros cuando falla el envío o la configuración", async () => {
    signUpMock.mockResolvedValue({ error: Object.assign(new Error("SMTP private detail"), { code: "email_provider_disabled", status: 500 }) });
    render(<AccountPage />);

    const form = getAuthForm("Crear cuenta");
    setCredentials(form, "ana@example.com");
    fireEvent.click(within(form).getByRole("button", { name: "Registrarme" }));

    const alert = await within(form).findByRole("alert");
    expect(alert).toHaveTextContent("email_provider_disabled");
    expect(alert).toHaveTextContent("HTTP 500");
    expect(alert).not.toHaveTextContent("SMTP private detail");
    expect(alert).not.toHaveTextContent("ana@example.com");
  });

  it("presenta estados fijos para un callback confirmado o inválido y limpia los parámetros", async () => {
    window.history.replaceState(null, "", "/cuenta?auth=confirmed");
    const { unmount } = render(<AccountPage />);
    expect(await screen.findByText("Correo confirmado. Ya puedes iniciar sesión.")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    unmount();

    window.history.replaceState(null, "", "/cuenta?auth=confirmation_error");
    render(<AccountPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo confirmar el correo");
    expect(window.location.search).toBe("");
  });
});
