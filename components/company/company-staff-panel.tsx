"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { cancelInvitation } from "@/lib/actions/team";
import { updateCompanyStaffPermissions } from "@/lib/actions/company-staff";
import { InviteStaffDialog } from "@/components/company/invite-staff-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CompanyStaffMember, PendingStaffInvitation } from "@/lib/data/company-staff";

/**
 * «Personal administrativo» (SUBCTA-*): visible sólo para el dueño de la
 * empresa. Lo que hoy hacen 3 personas con la misma cuenta de gerente pasa a
 * ser, cada una, una subcuenta con sus propios permisos.
 */
export function CompanyStaffPanel({
  members,
  invitations,
}: {
  members: CompanyStaffMember[];
  invitations: PendingStaffInvitation[];
}) {
  const t = useTranslations("CompanyStaff");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = (
    member: CompanyStaffMember,
    field: "canManageFinance" | "canManageSettings",
  ) => {
    startTransition(async () => {
      const res = await updateCompanyStaffPermissions({
        userId: member.userId,
        canManageFinance: field === "canManageFinance" ? !member.canManageFinance : member.canManageFinance,
        canManageSettings: field === "canManageSettings" ? !member.canManageSettings : member.canManageSettings,
      });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  };

  const cancel = (id: string, email: string) => {
    if (!window.confirm(t("cancelConfirm", { email }))) return;
    startTransition(async () => {
      const res = await cancelInvitation(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("cancelled"));
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t("title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <InviteStaffDialog />
      </div>

      {members.length === 0 && invitations.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="mt-3 divide-y rounded-xl border bg-card">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <p className="text-sm font-medium">{member.fullName || t("unnamed")}</p>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={member.canManageFinance}
                    onChange={() => toggle(member, "canManageFinance")}
                    disabled={pending}
                    className="size-4 accent-primary"
                  />
                  {t("financeLabel")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={member.canManageSettings}
                    onChange={() => toggle(member, "canManageSettings")}
                    disabled={pending}
                    className="size-4 accent-primary"
                  />
                  {t("settingsLabel")}
                </label>
              </div>
            </div>
          ))}

          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {invitation.email} <Badge variant="secondary">{t("pending")}</Badge>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {invitation.expired
                    ? t("expired")
                    : t("expires", {
                        date: format.dateTime(new Date(invitation.expiresAt), {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }),
                      })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => cancel(invitation.id, invitation.email)}
              >
                {t("cancel")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
