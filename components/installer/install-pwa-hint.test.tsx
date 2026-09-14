// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/es.json";
import { InstallPwaHint } from "./install-pwa-hint";

const DISMISSED_KEY = "install-pwa-dismissed";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function setStandalone(matches: boolean) {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

function renderHint() {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={messages}>
      <InstallPwaHint />
    </NextIntlClientProvider>,
  );
}

/** El evento real trae `.prompt()` y `.userChoice`; acá se agregan a mano
 * sobre un `Event` de verdad, como hace `task-actions.test.tsx` con sus
 * eventos propios. */
function beforeInstallPromptEvent(prompt: () => Promise<void>, userChoice: Promise<{ outcome: "accepted" | "dismissed" }>) {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt, userChoice });
  return event;
}

beforeEach(() => {
  window.localStorage.clear();
  setStandalone(false);
  setUserAgent(DESKTOP_UA);
});
afterEach(cleanup);

describe("empuje para instalar la PWA", () => {
  it("no aparece en escritorio", () => {
    renderHint();
    expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull();
  });

  it("no aparece si ya corre instalada, aunque el teléfono sea compatible", () => {
    setUserAgent(IOS_UA);
    setStandalone(true);
    renderHint();
    expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull();
  });

  it("no vuelve a aparecer después de que la persona la cerró", () => {
    setUserAgent(IOS_UA);
    window.localStorage.setItem(DISMISSED_KEY, "1");
    renderHint();
    expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull();
  });

  it("en Android no muestra nada hasta que el navegador ofrece instalarla", () => {
    setUserAgent(ANDROID_UA);
    renderHint();
    // Nada ofrecible todavía: mostrar un botón sin acción sería peor que no
    // mostrar nada.
    expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull();
  });

  it("en iPhone explica los pasos a mano, porque Safari no tiene instalación por evento", async () => {
    setUserAgent(IOS_UA);
    renderHint();
    await screen.findByText(messages.InstallPwa.banner);

    fireEvent.click(screen.getByRole("button", { name: messages.InstallPwa.install }));
    expect(await screen.findByText(messages.InstallPwa.iosTitle)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: messages.InstallPwa.gotIt }));
    await waitFor(() => expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull());
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("en Android instala con un toque cuando el navegador lo ofrece, y no vuelve a insistir", async () => {
    setUserAgent(ANDROID_UA);
    renderHint();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const userChoice = Promise.resolve({ outcome: "accepted" as const });
    fireEvent(window, beforeInstallPromptEvent(prompt, userChoice));

    await screen.findByText(messages.InstallPwa.banner);
    fireEvent.click(screen.getByRole("button", { name: messages.InstallPwa.install }));

    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull());
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("si la persona rechaza el instalador nativo, se repliega sin marcar un descarte permanente", async () => {
    setUserAgent(ANDROID_UA);
    renderHint();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const userChoice = Promise.resolve({ outcome: "dismissed" as const });
    fireEvent(window, beforeInstallPromptEvent(prompt, userChoice));

    await screen.findByText(messages.InstallPwa.banner);
    fireEvent.click(screen.getByRole("button", { name: messages.InstallPwa.install }));

    await waitFor(() => expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull());
    // Sin descarte permanente: si Chrome vuelve a ofrecerlo, tiene que poder reaparecer.
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBeNull();
  });

  it("el botón de cerrar descarta el aviso para siempre", async () => {
    setUserAgent(IOS_UA);
    renderHint();
    await screen.findByText(messages.InstallPwa.banner);

    fireEvent.click(screen.getByRole("button", { name: messages.InstallPwa.dismiss }));
    await waitFor(() => expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull());
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("dejar de mostrarla al instalarse por otra vía (appinstalled)", async () => {
    setUserAgent(IOS_UA);
    renderHint();
    await screen.findByText(messages.InstallPwa.banner);

    fireEvent(window, new Event("appinstalled"));
    await waitFor(() => expect(screen.queryByText(messages.InstallPwa.banner)).toBeNull());
  });
});
