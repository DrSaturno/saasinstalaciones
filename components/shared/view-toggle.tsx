"use client";

import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "list" | "board";

/**
 * Persiste la preferencia lista/tablero por módulo en localStorage.
 *
 * El primer render usa `initial` para que servidor y cliente coincidan, y una
 * vez montado se adopta lo guardado. Es exactamente el caso que los efectos
 * existen para cubrir —sincronizar con un sistema externo al montar—, de ahí
 * la excepción a la regla de setState en efectos.
 */
export function useViewMode(storageKey: string, initial: ViewMode = "list") {
  const [mode, setModeState] = useState<ViewMode>(initial);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "list" || stored === "board") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adoptar la preferencia guardada al montar
      setModeState(stored);
    }
  }, [storageKey]);

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next);
      window.localStorage.setItem(storageKey, next);
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
