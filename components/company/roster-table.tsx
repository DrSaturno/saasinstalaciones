"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setRosterStatus } from "@/lib/actions/team";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RosterMember } from "@/lib/data/team";

export function RosterTable({ members }: { members: RosterMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (
    installerId: string,
    status: "active" | "removed",
    name: string,
  ) => {
    startTransition(async () => {
      const res = await setRosterStatus(installerId, status);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        status === "removed" ? `${name} salió del equipo` : `${name} reactivado`,
      );
      router.refresh();
    });
  };

  const active = members.filter((m) => m.status !== "removed");
  const removed = members.filter((m) => m.status === "removed");

  if (members.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Todavía no tenés instaladores en tu equipo. Invitá al primero.
        </p>
      </div>
    );
  }

  const Row = ({ m }: { m: RosterMember }) => (
    <TableRow>
      <TableCell>
        <span className="font-medium">{m.name}</span>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {m.zones.length ? m.zones.join(", ") : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {m.ratingCount > 0 ? `★ ${m.ratingAvg.toFixed(1)}` : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">{m.openOrders}</TableCell>
      <TableCell className="text-right">
        {m.status === "removed" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => change(m.installerId, "active", m.name)}
          >
            Reactivar
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => change(m.installerId, "removed", m.name)}
          >
            Quitar
          </Button>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Instalador</TableHead>
              <TableHead>Zonas</TableHead>
              <TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right">Órdenes abiertas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((m) => (
              <Row key={m.installerId} m={m} />
            ))}
          </TableBody>
        </Table>
      </div>

      {removed.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            Fuera del equipo
            <Badge variant="secondary">{removed.length}</Badge>
          </h2>
          <div className="overflow-x-auto rounded-xl border bg-card opacity-70">
            <Table>
              <TableBody>
                {removed.map((m) => (
                  <Row key={m.installerId} m={m} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
