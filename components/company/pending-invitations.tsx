"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
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
  const t = useTranslations("PendingInvitations");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (invitations.length === 0) return null;

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    toast.success(t("copied"));
  };

  const cancel = (id: string) => {
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
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {t("title")}
        <Badge variant="secondary">{invitations.length}</Badge>
      </h2>
      <div className="divide-y rounded-xl border bg-card">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {inv.email} · {t(`roles.${inv.role}`)}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {inv.expired
                  ? t("expired")
                  : t("expires", {
                      date: format.dateTime(new Date(inv.expiresAt), {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      }),
                    })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!inv.expired && (
                <Button variant="outline" size="sm" onClick={() => copyLink(inv.token)}>
                  {t("copy")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => cancel(inv.id)}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
