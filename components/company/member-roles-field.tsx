"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MinusCircle, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { grantMemberRole, revokeMemberRole } from "@/lib/actions/team";
import type { MembershipRole } from "@/types/database";

type RoleOperation = "grant" | "revoke";

/**
 * Único punto de la app que asigna o quita las capacidades de
 * instalación/coordinación de alguien en el equipo. Antes había dos caminos
 * — este toggle aditivo en el roster, y un botón de "degradar" aparte que
 * llamaba a un wrapper legacy con semántica distinta — y podían divergir.
 */
export function RoleToggleButtons({
  installerId,
  name,
  roles,
}: {
  installerId: string;
  name: string;
  roles: MembershipRole[];
}) {
  const t = useTranslations("Roster");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeRole = (role: MembershipRole, operation: RoleOperation) => {
    const roleName = t(
      role === "installer" ? "installerRoleName" : "coordinatorRoleName",
    );
    const confirmation = t(
      operation === "grant" ? "grantRoleConfirm" : "revokeRoleConfirm",
      { name, role: roleName },
    );
    if (!window.confirm(confirmation)) return;

    startTransition(async () => {
      const result =
        operation === "grant"
          ? await grantMemberRole(installerId, role)
          : await revokeMemberRole(installerId, role);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        t(operation === "grant" ? "roleGranted" : "roleRevoked", {
          name,
          role: roleName,
        }),
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {(["installer", "coordinator"] as const).map((role) => {
        const hasRole = roles.includes(role);
        if (hasRole && roles.length <= 1) return null;
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
            onClick={() => changeRole(role, operation)}
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
    </div>
  );
}

export function RoleBadges({ roles }: { roles: MembershipRole[] }) {
  const t = useTranslations("Roster");
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {roles.includes("installer") ? (
        <Badge variant="outline">{t("installerBadge")}</Badge>
      ) : null}
      {roles.includes("coordinator") ? (
        <Badge variant="secondary">{t("coordinatorBadge")}</Badge>
      ) : null}
    </span>
  );
}

/** Insignias + toggles juntos, para pantallas que no partan esto en columnas. */
export function MemberRolesField({
  installerId,
  name,
  roles,
  canManage,
}: {
  installerId: string;
  name: string;
  roles: MembershipRole[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RoleBadges roles={roles} />
      {canManage ? (
        <RoleToggleButtons installerId={installerId} name={name} roles={roles} />
      ) : null}
    </div>
  );
}
