"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { transitionOrder, assignInstaller } from "@/lib/actions/orders";
import { ORDER_TRANSITIONS, TRANSITION_LABEL, isTerminal } from "@/lib/domain/transitions";
import { ORDER_STATUS } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/types/database";

type Props = {
  orderId: string;
  status: OrderStatus;
  installerId: string | null;
  roster: { id: string; name: string }[];
};

export function OrderActions({ orderId, status, installerId, roster }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const targets = ORDER_TRANSITIONS[status] ?? [];

  const doTransition = (to: OrderStatus) => {
    startTransition(async () => {
      const res = await transitionOrder(orderId, to);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Orden → ${ORDER_STATUS[to].label}`);
        router.refresh();
      }
    });
  };

  const doAssign = (value: string) => {
    const id = value === "" ? null : value;
    startTransition(async () => {
      const res = await assignInstaller(orderId, id);
      if (res.error) toast.error(res.error);
      else {
        toast.success(id ? "Instalador asignado" : "Asignación quitada");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Asignación */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Instalador</h3>
        {roster.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Todavía no tenés instaladores en tu equipo.
          </p>
        ) : (
          <select
            value={installerId ?? ""}
            disabled={pending}
            onChange={(e) => doAssign(e.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
          >
            <option value="">Sin asignar</option>
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Transiciones */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Cambiar estado</h3>
        {isTerminal(status) ? (
          <p className="mt-2 text-sm text-muted-foreground">
            La orden está {ORDER_STATUS[status].label.toLowerCase()}. No admite
            más cambios.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {targets.map((to) => (
              <Button
                key={to}
                variant={to === "cancelada" ? "outline" : "default"}
                disabled={pending}
                onClick={() => doTransition(to)}
                className="justify-start"
              >
                {TRANSITION_LABEL[to]}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
