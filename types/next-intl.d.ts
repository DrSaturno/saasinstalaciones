import es from "@/messages/es.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "es-AR" | "pt-BR";
    Messages: typeof es;
  }
}
