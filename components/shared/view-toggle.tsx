"use client";

import { useCallback, useSyncExternalStore } from "react";
import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "list" | "board";

/**
 * Persiste la preferencia lista/tablero por módulo en localStorage.
 * Usa useSyncExternalStore: SSR devuelve `initial` y el cliente sincroniza sin
 * mismatch de hidratación. `setMode` emite un StorageEvent para refrescar la
 * misma pestaña (el evento nativo solo dispara entre pestañas).
 */
export function useViewMode(storageKey: string, initial: ViewMode = "list") {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const getSnapshot = useCallback(() => {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "list" || stored === "board" ? stored : initial;
  }, [storageKey, initial]);

  const mode = useSyncExternalStore(subscribe, getSnapshot, () => initial);

  const setMode = useCallback(
    (next: ViewMode) => {
      window.localStorage.setItem(storageKey, next);
      window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
    },
    [storageKey],
  );

  return [mode, setMode] as const;
}

/** Segmented control Lista | Tablero. Los labels los pasa cada módulo (i18n). */
export function ViewToggle({
  value,
  onChange,
  labels = { list: "Lista", board: "Tablero" },
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  labels?: { list: string; board: string };
}) {
  const options: { mode: ViewMode; icon: typeof List; label: string }[] = [
    { mode: "list", icon: List, label: labels.list },
    { mode: "board", icon: LayoutGrid, label: labels.board },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-0.5" role="group">
      {options.map(({ mode, icon: Icon, label }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-primary-soft/60 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
