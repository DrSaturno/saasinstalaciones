"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelInvitation } from "@/lib/actions/team";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PendingInvitation } from "@/lib/data/team";

export function PendingInvitations({
  invitations,
}: {
  invitations: PendingInvitation[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (invitations.length === 0) return null;

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    toast.success("Link copiado");
  };

  const cancel = (id: string) => {
    startTransition(async () => {
      const res = await cancelInvitation(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Invitación cancelada");
        router.refresh();
      }
    });
  };

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        Invitaciones pendientes
        <Badge variant="secondary">{invitations.length}</Badge>
      </h2>
      <div className="divide-y rounded-xl border bg-card">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{inv.email}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {inv.expired ? "Vencida" : `Vence ${new Date(inv.expiresAt).toLocaleDateString("es-AR")}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!inv.expired && (
                <Button variant="outline" size="sm" onClick={() => copyLink(inv.token)}>
                  Copiar link
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => cancel(inv.id)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
