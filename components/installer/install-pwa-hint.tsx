"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISSED_KEY = "install-pwa-dismissed";

/**
 * El evento que Chrome/Android dispara cuando la PWA cumple sus criterios de
 * instalabilidad. Ningún navegador lo tipa todavía en `lib.dom`, así que se
 * declara acá con lo mínimo que se usa.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari/iOS todavía no tiene `display-mode: standalone` confiable en
    // todas las versiones; expone esta propiedad no estándar para lo mismo.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Empuje para instalar la PWA en el teléfono del instalador.
 *
 * Android/Chrome expone `beforeinstallprompt`: capturarlo y disparar
 * `.prompt()` alcanza, un toque y la persona ya tiene el ícono. iOS no tiene
 * ese evento -Apple no lo implementa en Safari, por decisión propia, y no hay
 * forma de invocar la instalación desde código-, así que ahí sólo se puede
 * explicar los pasos a mano: Compartir → Agregar a pantalla de inicio.
 *
 * No se muestra si ya corre instalada (`display-mode: standalone`), en un
 * navegador de escritorio, ni después de que la persona la cierre una vez:
 * es un empujón para el trabajo de campo, no una insistencia.
 */
export function InstallPwaHint() {
  const t = useTranslations("InstallPwa");
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;

    const ios = isIos();
    if (!ios && !/android/i.test(window.navigator.userAgent)) return;

    // iOS nunca dispara `beforeinstallprompt` -no existe en Safari-, así que
    // ahí no hay nada que esperar: se muestra directo. El primer render
    // (servidor y cliente) queda oculto para que coincidan; recién acá, con
    // datos que sólo existen en el navegador, se decide mostrar algo.
    if (ios) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- decisión que depende de APIs sólo disponibles tras montar
      setVisible(true);
    }

    const onBeforeInstall = (event: Event) => {
      // Sin `preventDefault` Chrome muestra su propio banner y el nuestro
      // compiten. En Android recién acá hay algo ofrecible: mostrar el
      // banner y capturar el evento se deciden juntos, para que el botón
      // nunca quede sin acción.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) {
      // iOS, o Android antes de que el navegador ofrezca el evento: lo único
      // que se puede hacer es explicar el camino manual.
      setShowIosSteps(true);
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      // Ya se instaló: no hay motivo para volver a ofrecerlo.
      dismiss();
    } else {
      // Dijo que no esta vez. Se repliega sin marcar el descarte permanente:
      // si Chrome vuelve a considerarla instalable más adelante, reaparece.
      setVisible(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b bg-primary-soft/40 px-4 py-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{t("banner")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" className="min-h-11" onClick={install}>
            {t("install")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={dismiss}
            aria-label={t("dismiss")}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Dialog open={showIosSteps} onOpenChange={setShowIosSteps}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("iosTitle")}</DialogTitle>
            <DialogDescription>{t("iosDescription")}</DialogDescription>
          </DialogHeader>
          <ol className="ml-4 list-decimal space-y-2 text-sm">
            <li>{t("iosStep1")}</li>
            <li className="flex flex-wrap items-center gap-1">
              {t("iosStep2")}
              <Share2 className="inline size-4" aria-hidden="true" />
            </li>
            <li>{t("iosStep3")}</li>
            <li>{t("iosStep4")}</li>
          </ol>
          <DialogFooter>
            <Button onClick={dismiss}>{t("gotIt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
