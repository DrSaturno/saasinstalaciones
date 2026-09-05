/**
 * Actores del seed local (`supabase/seed.sql`).
 *
 * Son cuentas sintéticas de un entorno desechable, no credenciales: la misma
 * contraseña está en el seed versionado. Si alguna vez se corre contra un
 * entorno compartido, se sobreescribe por `E2E_PASSWORD`.
 */
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "InstalaPro2026!";

export type ActorName =
  | "platformAdmin"
  | "manager"
  | "managerB"
  | "coordinator"
  | "installer";

export type Actor = {
  email: string;
  /** Ruta a la que el proxy manda a este rol después de entrar. */
  landing: string;
  /** Rutas de otras áreas: el proxy tiene que sacarlo de acá. */
  forbidden: string[];
  storageState: string;
};

export const ACTORS: Record<ActorName, Actor> = {
  platformAdmin: {
    email: "admin@instalapro.dev",
    landing: "/master",
    forbidden: ["/dashboard", "/home"],
    storageState: "e2e/.auth/platform-admin.json",
  },
  manager: {
    email: "gerente@demo.dev",
    landing: "/dashboard",
    forbidden: ["/master", "/home"],
    storageState: "e2e/.auth/manager.json",
  },
  managerB: {
    // Segunda empresa: existe para probar aislamiento entre tenants.
    email: "gerente.b@demo.dev",
    landing: "/dashboard",
    forbidden: ["/master"],
    storageState: "e2e/.auth/manager-b.json",
  },
  coordinator: {
    email: "coordinador@demo.dev",
    landing: "/home",
    forbidden: ["/master", "/dashboard"],
    storageState: "e2e/.auth/coordinator.json",
  },
  installer: {
    email: "instalador1@demo.dev",
    landing: "/home",
    forbidden: ["/master", "/dashboard"],
    storageState: "e2e/.auth/installer.json",
  },
};
