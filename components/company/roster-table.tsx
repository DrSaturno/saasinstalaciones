"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("Roster");
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
        status === "removed"
          ? t("removed", { name })
          : t("reactivated", { name }),
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
          {t("empty")}
        </p>
      </div>
    );
  }

  const Row = ({ m }: { m: RosterMember }) => (
    <TableRow>
      <TableCell>
        <Link href={`/messages/${m.installerId}`} className="font-medium hover:text-primary">
          {m.name}
        </Link>
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
            {t("reactivate")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => change(m.installerId, "removed", m.name)}
          >
            {t("remove")}
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
              <TableHead>{t("installer")}</TableHead>
              <TableHead>{t("zones")}</TableHead>
              <TableHead className="text-right">{t("rating")}</TableHead>
              <TableHead className="text-right">{t("openOrders")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
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
            {t("outside")}
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
