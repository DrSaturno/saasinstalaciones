// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/es.json";

const { signOutForInvitation, toastSuccess, toastError } = vi.hoisted(() => ({
  signOutForInvitation: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/actions/invitations", () => ({ signOutForInvitation }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
import { WrongAccountActions } from "./wrong-account-actions";

const TOKEN = "0b9c6f3e-2d4a-4c8e-9a51-7f3e2b1d6c90";
const writeText = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  signOutForInvitation.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});
afterEach(cleanup);

function renderActions() {
  render(
    <NextIntlClientProvider locale="es-AR" messages={messages}>
      <WrongAccountActions token={TOKEN} />
    </NextIntlClientProvider>,
  );
}

describe("invitación abierta con una cuenta que no puede aceptarla", () => {
  it("no es un callejón: ofrece copiar el link, cerrar sesión y volver al panel", () => {
    renderActions();
    expect(screen.getByRole("button", { name: "Copiar link para el instalador" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cerrar sesión y crear la cuenta de instalador" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver a mi panel" }).getAttribute("href")).toBe("/");
  });

  it("copia el link limpio de la invitación, sin parámetros extra", async () => {
    writeText.mockResolvedValue(undefined);
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Copiar link para el instalador" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link copiado"));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/${TOKEN}`);
    expect(signOutForInvitation).not.toHaveBeenCalled();
  });

  it("si el navegador no deja copiar, muestra el link para copiarlo a mano", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderActions();
    expect(screen.queryByRole("textbox", { name: "Link de la invitación" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copiar link para el instalador" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    const field = screen.getByRole("textbox", { name: "Link de la invitación" }) as HTMLInputElement;
    expect(field.value).toBe(`${window.location.origin}/invite/${TOKEN}`);
    expect(field.readOnly).toBe(true);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("cerrar sesión llama a la acción con el token de esta invitación", async () => {
    renderActions();
    fireEvent.click(
      screen.getByRole("button", { name: "Cerrar sesión y crear la cuenta de instalador" }),
    );
    await waitFor(() => expect(signOutForInvitation).toHaveBeenCalledWith(TOKEN));
  });
});
