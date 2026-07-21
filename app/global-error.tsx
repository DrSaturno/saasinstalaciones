"use client";

/*
 * Fallback de último recurso: se activa si falla el propio layout raíz, por lo
 * que debe renderizar su propio <html>/<body> y NO tiene el provider de
 * next-intl disponible. Es la única excepción a la regla #4 (i18n): leemos la
 * cookie de idioma y usamos un diccionario mínimo embebido.
 */
const COPY = {
  es: {
    title: "Algo salió mal",
    body: "Tuvimos un problema al cargar la aplicación. Probá de nuevo.",
    retry: "Reintentar",
  },
  pt: {
    title: "Algo deu errado",
    body: "Tivemos um problema ao carregar o aplicativo. Tente novamente.",
    retry: "Tentar de novo",
  },
} as const;

function readLocale(): "es" | "pt" {
  if (typeof document === "undefined") return "es";
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(es|pt)/);
  return match?.[1] === "pt" ? "pt" : "es";
}

export default function GlobalError({ reset }: { reset: () => void }) {
  const c = COPY[readLocale()];

  return (
    <html lang="es">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "6rem 1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#070709",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          {c.title}
        </h1>
        <p style={{ color: "#60606c", maxWidth: "28rem", margin: 0 }}>{c.body}</p>
        <button
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            borderRadius: "0.625rem",
            border: "none",
            background: "#2597d0",
            color: "#fff",
            padding: "0.625rem 1.25rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          {c.retry}
        </button>
      </body>
    </html>
  );
}
