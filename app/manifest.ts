import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Instala Pro",
    short_name: "Instala Pro",
    description: "Gestión de instalaciones para equipos de campo.",
    start_url: "/tasks",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#2597d0",
    orientation: "portrait",
    lang: "es",
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
