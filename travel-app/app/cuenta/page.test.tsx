import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  signInWithPasswordMock,
  signUpMock,
  getUserMock,
  onAuthStateChangeMock,
  unsubscribeMock,
  replaceMock,
} = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
  getUserMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

vi.mock("@/app/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      getUser: getUserMock,
      onAuthStateChange: onAuthStateChangeMock,
      signOut: vi.fn(),
    },
  }),
}));

import AccountPage from "@/app/cuenta/page";

function getAuthForm(title: string): HTMLFormElement {
  const heading = screen.getByRole("heading", { name: title });
  const form = heading.closest("form");
  if (!(form instanceof HTMLFormElement)) throw new Error(`No se encontró el formulario ${title}.`);
  return form;
}

describe("formularios de autenticación de Cuenta", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    getUserMock.mockResolvedValue({ data: { user: null } });
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: unsubscribeMock } } });
    signInWithPasswordMock.mockReset();
    signUpMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mantiene campos y mensajes independientes y envía a cada acción sus propias credenciales", async () => {
    signInWithPasswordMock.mockResolvedValue({ error: new Error("Credenciales de acceso incorrectas.") });
    signUpMock.mockResolvedValue({ error: null, data: { user: null, session: null } });
    render(<AccountPage />);

    expect(screen.getByText("Preferencias de viaje")).toBeInTheDocument();
    expect(screen.getByText("Destinos favoritos")).toBeInTheDocument();

    const signInForm = getAuthForm("Iniciar sesión");
    const signUpForm = getAuthForm("Crear cuenta");
    const signIn = within(signInForm);
    const signUp = within(signUpForm);

    fireEvent.change(signIn.getByLabelText("Correo"), { target: { value: "acceso@example.com" } });
    fireEvent.change(signIn.getByLabelText("Contraseña"), { target: { value: "clave-acceso-123" } });
    fireEvent.change(signUp.getByLabelText("Correo"), { target: { value: "registro@example.com" } });
    fireEvent.change(signUp.getByLabelText("Contraseña"), { target: { value: "clave-registro-456" } });

    expect(signIn.getByLabelText("Correo")).toHaveValue("acceso@example.com");
    expect(signUp.getByLabelText("Correo")).toHaveValue("registro@example.com");
    expect(signIn.getByLabelText("Contraseña")).toHaveValue("clave-acceso-123");
    expect(signUp.getByLabelText("Contraseña")).toHaveValue("clave-registro-456");

    fireEvent.click(signIn.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "acceso@example.com",
      password: "clave-acceso-123",
    }));
    expect(signIn.getByRole("alert")).toHaveTextContent("Credenciales de acceso incorrectas.");
    expect(signUp.queryByRole("alert")).not.toBeInTheDocument();
    expect(signUp.getByLabelText("Correo")).toHaveValue("registro@example.com");

    fireEvent.click(signUp.getByRole("button", { name: "Registrarme" }));
    await waitFor(() => expect(signUpMock).toHaveBeenCalledWith({
      email: "registro@example.com",
      password: "clave-registro-456",
    }));
    expect(signUp.getByRole("status")).toHaveTextContent("Cuenta creada. Confirma el correo");
    expect(signIn.getByRole("alert")).toHaveTextContent("Credenciales de acceso incorrectas.");
  });
});
