"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Envoltorio de los accesos rápidos que sólo miran algo, sin editarlo.
 *
 * El resto de la botonera abre el trabajo ahí mismo; estos tres sacaban al
 * gerente del tablero para que después volviera. Ahora asoman la lista corta y
 * dejan el link al módulo completo abajo, para cuando de verdad haga falta.
 *
 * El contenedor de la botonera estira el elemento interactivo sobre toda la
 * celda, así que el disparador tiene que ser un `button` en la raíz.
 */
export function DashboardPeekDialog({
  label,
  emptyLabel,
  href,
  hrefLabel,
  count,
  children,
}: {
  label: string;
  emptyLabel: string;
  href: string;
  hrefLabel: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{label}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {label}
            {count > 0 ? <span className="ml-2 font-mono text-sm text-muted-foreground">{count}</span> : null}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {count === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            children
          )}
        </div>
        <DialogFooter>
          <Button asChild variant="ghost" size="sm">
            <Link href={href}>
              {hrefLabel}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cuántos ítems se listan antes de mandar al módulo completo. */
export const PEEK_LIMIT = 12;
