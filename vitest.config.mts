import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // `e2e` corre con Playwright (`pnpm test:e2e`): necesita navegador y una
    // base sembrada, así que no tiene que arrancar dentro de la suite unitaria.
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // `server-only` lanza si se importa fuera del build RSC; en la suite
      // unitaria se reemplaza por un stub vacío. El build de producción sigue
      // aplicando la frontera server/client de verdad.
      "server-only": path.resolve(__dirname, "test/stubs/empty.ts"),
    },
  },
});
