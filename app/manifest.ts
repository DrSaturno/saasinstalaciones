import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("Metadata"),
  ]);
  return {
    name: "Instala Pro",
    short_name: "Instala Pro",
    description: t("manifestDescription"),
    // El instalador arranca en su centro operativo, igual que al entrar por
    // web: el próximo destino, la semana y los bloques por empresa. Antes
    // abría en /tasks (la lista pelada), que dejaba a la PWA instalada con una
    // entrada distinta a la del navegador.
    start_url: "/home",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#2597d0",
    orientation: "portrait",
    lang: locale,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
