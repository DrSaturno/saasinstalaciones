"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { RoleBadges, RoleToggleButtons } from "@/components/company/member-roles-field";
import type { RosterMember } from "@/lib/data/team";

export function RosterMemberRow({
  member,
  canManageRoles,
  pending,
  onStatusChange,
}: {
  member: RosterMember;
  canManageRoles: boolean;
  pending: boolean;
  onStatusChange: (member: RosterMember, status: "active" | "removed") => void;
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
        <span className="ml-2 align-middle">
          <RoleBadges roles={member.roles} />
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
            <RoleToggleButtons
              installerId={member.installerId}
              name={member.name}
              roles={member.roles}
            />
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
