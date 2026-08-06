"use client";

import { MinusCircle, PlusCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { RosterMember } from "@/lib/data/team";
import type { MembershipRole } from "@/types/database";

type RoleOperation = "grant" | "revoke";

export function RosterMemberRow({
  member,
  canManageRoles,
  pending,
  onStatusChange,
  onRoleChange,
}: {
  member: RosterMember;
  canManageRoles: boolean;
  pending: boolean;
  onStatusChange: (member: RosterMember, status: "active" | "removed") => void;
  onRoleChange: (
    member: RosterMember,
    role: MembershipRole,
    operation: RoleOperation,
  ) => void;
}) {
  const t = useTranslations("Roster");

  return (
    <TableRow>
      <TableCell>
        <span className="inline-flex items-center gap-2 align-middle">
          {member.avatarUrl ? (
            <Image
              src={member.avatarUrl}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="size-7 shrink-0 rounded-full border object-cover"
            />
          ) : null}
          <Link
            href={`/team/${member.installerId}`}
            className="font-medium hover:text-primary"
          >
            {member.name}
          </Link>
        </span>
        <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
          {member.roles.includes("installer") ? (
            <Badge variant="outline">{t("installerBadge")}</Badge>
          ) : null}
          {member.roles.includes("coordinator") ? (
            <Badge variant="secondary">{t("coordinatorBadge")}</Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {member.zones.length ? member.zones.join(", ") : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {member.ratingCount > 0 ? `★ ${member.ratingAvg.toFixed(1)}` : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {member.openOrders}
      </TableCell>
      <TableCell className="text-right">
        {member.status === "removed" ? (
          canManageRoles ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onStatusChange(member, "active")}
            >
              {t("reactivate")}
            </Button>
          ) : (
            "—"
          )
        ) : canManageRoles ? (
          <div className="flex flex-wrap justify-end gap-2">
            {(["installer", "coordinator"] as const).map((role) => {
              const hasRole = member.roles.includes(role);
              if (hasRole && member.roles.length <= 1) return null;
              const operation: RoleOperation = hasRole ? "revoke" : "grant";
              const label =
                operation === "grant"
                  ? role === "installer"
                    ? t("addInstallerRole")
                    : t("addCoordinatorRole")
                  : role === "installer"
                    ? t("removeInstallerRole")
                    : t("removeCoordinatorRole");

              return (
                <Button
                  key={`${operation}:${role}`}
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => onRoleChange(member, role, operation)}
                >
                  {operation === "grant" ? (
                    <PlusCircle className="size-3.5" aria-hidden="true" />
                  ) : (
                    <MinusCircle className="size-3.5" aria-hidden="true" />
                  )}
                  {label}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onStatusChange(member, "removed")}
            >
              {t("remove")}
            </Button>
          </div>
        ) : (
          "—"
        )}
      </TableCell>
    </TableRow>
  );
}
