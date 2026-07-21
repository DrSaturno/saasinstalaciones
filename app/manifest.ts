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
    start_url: "/tasks",
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
