"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RosterMemberRow } from "@/components/company/roster-member-row";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  grantMemberRole,
  revokeMemberRole,
  setRosterStatus,
} from "@/lib/actions/team";
import type { RosterMember } from "@/lib/data/team";
import type { MembershipRole } from "@/types/database";

type RoleOperation = "grant" | "revoke";

export function RosterTable({
  members,
  canManageRoles = false,
}: {
  members: RosterMember[];
  canManageRoles?: boolean;
}) {
  const t = useTranslations("Roster");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeStatus = (
    member: RosterMember,
    status: "active" | "removed",
  ) => {
    startTransition(async () => {
      const result = await setRosterStatus(member.installerId, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        status === "removed"
          ? t("removed", { name: member.name })
          : t("reactivated", { name: member.name }),
      );
      router.refresh();
    });
  };

  const changeRole = (
    member: RosterMember,
    role: MembershipRole,
    operation: RoleOperation,
  ) => {
    const roleName = t(
      role === "installer" ? "installerRoleName" : "coordinatorRoleName",
    );
    const confirmation = t(
      operation === "grant" ? "grantRoleConfirm" : "revokeRoleConfirm",
      { name: member.name, role: roleName },
    );
    if (!window.confirm(confirmation)) return;

    startTransition(async () => {
      const result =
        operation === "grant"
          ? await grantMemberRole(member.installerId, role)
          : await revokeMemberRole(member.installerId, role);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        t(operation === "grant" ? "roleGranted" : "roleRevoked", {
          name: member.name,
          role: roleName,
        }),
      );
      router.refresh();
    });
  };

  const active = members.filter((member) => member.status !== "removed");
  const removed = members.filter((member) => member.status === "removed");

  if (members.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  const renderMember = (member: RosterMember) => (
    <RosterMemberRow
      key={member.installerId}
      member={member}
      canManageRoles={canManageRoles}
      pending={pending}
      onStatusChange={changeStatus}
      onRoleChange={changeRole}
    />
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
          <TableBody>{active.map(renderMember)}</TableBody>
        </Table>
      </div>

      {removed.length > 0 ? (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {t("outside")}
            <Badge variant="secondary">{removed.length}</Badge>
          </h2>
          <div className="overflow-x-auto rounded-xl border bg-card opacity-70">
            <Table>
              <TableBody>{removed.map(renderMember)}</TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
