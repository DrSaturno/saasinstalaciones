/**
 * Tipos compartidos por los casos de uso de proyectos.
 *
 * Vive aparte de `context.ts` a propósito: los componentes cliente importan
 * `ActionState` e `ImportResult`, y este archivo no arrastra nada de servidor.
 */

export type ActionState = { error: string | null; ok?: boolean };

export type ImportResult = {
  error: string | null;
  inserted: number;
  skipped: { row: number; reason: string }[];
};
