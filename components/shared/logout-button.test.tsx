// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/es.json";

const { logoutAction, clearOfflineSession, pendingOfflineWork, flush } = vi.hoisted(() => ({
  logoutAction: vi.fn(), clearOfflineSession: vi.fn(), pendingOfflineWork: vi.fn(), flush: vi.fn(),
}));
vi.mock("@/lib/actions/session", () => ({ logoutAction }));
vi.mock("@/lib/offline/session-storage", () => ({ clearOfflineSession }));
vi.mock("@/lib/offline/db", () => ({ pendingOfflineWork }));
vi.mock("@/lib/offline/sync", () => ({ flush }));
import { LogoutButton } from "./logout-button";

beforeEach(() => {
  vi.resetAllMocks();
  pendingOfflineWork.mockResolvedValue({ operations: 2, photos: 1 });
  clearOfflineSession.mockResolvedValue(true);
  flush.mockResolvedValue(0);
});
afterEach(cleanup);

async function openLogout() {
  render(<NextIntlClientProvider locale="es-AR" messages={messages}><LogoutButton label="Salir" /></NextIntlClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Salir" }));
  await screen.findByRole("dialog");
  await waitFor(() => expect(screen.getByRole("button", { name: "Seguir trabajando" }).hasAttribute("disabled")).toBe(false));
}

describe("logout with offline work", () => {
  it("offers choices before removing pending changes or photos", async () => {
    await openLogout();
    expect(screen.getByText(/Quedan 2 cambios y 1 fotos/)).toBeTruthy();
    expect(clearOfflineSession).not.toHaveBeenCalled();
    expect(logoutAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Seguir trabajando" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(logoutAction).not.toHaveBeenCalled();
  });
  it("does not exit when synchronization leaves pending operations", async () => {
    await openLogout();
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar y salir" }));
    await screen.findByRole("alert");
    expect(flush).toHaveBeenCalledOnce();
    expect(clearOfflineSession).not.toHaveBeenCalled();
    expect(logoutAction).not.toHaveBeenCalled();
  });
  it("exits after successful synchronization and protected cleanup", async () => {
    await openLogout();
    pendingOfflineWork.mockResolvedValue({ operations: 0, photos: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar y salir" }));
    await waitFor(() => expect(logoutAction).toHaveBeenCalledOnce());
    expect(clearOfflineSession).toHaveBeenCalledWith(undefined, false);
  });
  it("discards pending work only after the explicit destructive choice", async () => {
    await openLogout();
    fireEvent.click(screen.getByRole("button", { name: "Descartar pendientes y salir" }));
    await waitFor(() => expect(logoutAction).toHaveBeenCalledOnce());
    expect(clearOfflineSession).toHaveBeenCalledWith(undefined, true);
  });
  it("keeps the session if new work arrives before cleanup or storage fails", async () => {
    pendingOfflineWork.mockResolvedValue({ operations: 0, photos: 0 });
    clearOfflineSession.mockResolvedValue(false);
    await openLogout();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(logoutAction).not.toHaveBeenCalled();
  });
  it("counts orphan photos as work even when the outbox is empty", async () => {
    pendingOfflineWork.mockResolvedValue({ operations: 0, photos: 1 });
    await openLogout();
    expect(logoutAction).not.toHaveBeenCalled();
    expect(clearOfflineSession).not.toHaveBeenCalled();
  });
  it("exits directly when there is no offline work", async () => {
    pendingOfflineWork.mockResolvedValue({ operations: 0, photos: 0 });
    render(<NextIntlClientProvider locale="es-AR" messages={messages}><LogoutButton label="Salir" /></NextIntlClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await waitFor(() => expect(logoutAction).toHaveBeenCalledOnce());
    expect(clearOfflineSession).toHaveBeenCalledWith(undefined, false);
  });
});
