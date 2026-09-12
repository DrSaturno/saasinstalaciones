// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/es.json";

const { enqueue, orderTransitionQueue, notifyQueued, prepareOfflineStorageForUser, refresh } =
  vi.hoisted(() => ({
    enqueue: vi.fn(),
    orderTransitionQueue: vi.fn(),
    notifyQueued: vi.fn(),
    prepareOfflineStorageForUser: vi.fn(),
    refresh: vi.fn(),
  }));

vi.mock("@/lib/offline/sync", () => ({ enqueue, orderTransitionQueue }));
vi.mock("@/lib/offline/use-sync", () => ({ notifyQueued }));
vi.mock("@/lib/offline/session-storage", () => ({ prepareOfflineStorageForUser }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/installer/accept-order-button", () => ({
  AcceptOrderButton: () => null,
}));

import { TaskActions } from "./task-actions";

/** Renderiza la ficha tal como la ve un instalador con la orden ya aceptada. */
function renderActions(status: "planificada" | "en_camino") {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={messages}>
      <TaskActions
        userId="installer-1"
        orderId="order-1"
        companyId="company-1"
        status={status}
        acceptedAt="2026-09-11T12:00:00.000Z"
        minPhotos={3}
        photoCount={0}
      />
    </NextIntlClientProvider>,
  );
}

/** La cola terminó de vaciarse. El `router.refresh()` todavía no volvió. */
function settleSync() {
  fireEvent(window, new Event("instalapro:sync-settled"));
}

beforeEach(() => {
  vi.resetAllMocks();
  prepareOfflineStorageForUser.mockResolvedValue(true);
  orderTransitionQueue.mockResolvedValue({ queued: null, rejected: null });
  enqueue.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("etapas de campo del instalador", () => {
  it("no retrocede de etapa cuando la cola se vacía antes del refresh", async () => {
    // El caso que se veía en la calle: se avisa "voy en camino", el envío entra,
    // y la pantalla volvía a ofrecer "voy en camino" porque las props todavía
    // eran la foto anterior. Después saltaba sola hacia adelante.
    renderActions("planificada");

    fireEvent.click(await screen.findByRole("button", { name: "Voy en camino" }));
    expect(await screen.findByRole("button", { name: "Llegué al sitio" })).toBeTruthy();

    settleSync();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Llegué al sitio" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Voy en camino" })).toBeNull();
  });

  it("vuelve al estado del servidor y explica por qué si el envío se rechaza", async () => {
    renderActions("planificada");

    fireEvent.click(await screen.findByRole("button", { name: "Voy en camino" }));
    await screen.findByRole("button", { name: "Llegué al sitio" });

    // La orden cambió por otro lado: el servidor rechaza la transición de forma
    // definitiva y el ítem queda bloqueado en la cola.
    orderTransitionQueue.mockResolvedValue({ queued: null, rejected: "en_camino" });
    settleSync();

    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Voy en camino" })).toBeTruthy(),
    );
  });

  it("cede ante el servidor apenas éste dice algo nuevo", async () => {
    // Conservar la etapa optimista no puede volverse ignorar al servidor: si el
    // tablero de la empresa movió la orden, esa es la verdad.
    const view = renderActions("planificada");

    fireEvent.click(await screen.findByRole("button", { name: "Voy en camino" }));
    await screen.findByRole("button", { name: "Llegué al sitio" });

    view.rerender(
      <NextIntlClientProvider locale="es-AR" messages={messages}>
        <TaskActions
          userId="installer-1"
          orderId="order-1"
          companyId="company-1"
          status="en_proceso"
          acceptedAt="2026-09-11T12:00:00.000Z"
          minPhotos={3}
          photoCount={3}
        />
      </NextIntlClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Marcar terminado" })).toBeTruthy();
  });

  it("recupera la etapa encolada al reabrir la orden sin señal", async () => {
    orderTransitionQueue.mockResolvedValue({ queued: "en_camino", rejected: null });
    renderActions("planificada");

    expect(await screen.findByRole("button", { name: "Llegué al sitio" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
