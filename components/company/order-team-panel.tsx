"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  addOrderTeamMember,
  removeOrderTeamMember,
  setTeamMemberAmount,
  setTeamMemberPaymentStatus,
} from "@/lib/actions/orders/team";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderTeamMember } from "@/lib/data/order-team";
import { orderStaffing } from "@/lib/domain/order-staffing";
import type { OrderCurrency } from "@/types/database";

const MAX_TEAM = 15;

/**
 * Plantel de la orden (bloque 5): el responsable más hasta 14 ayudantes, cada
 * uno con su propio monto y su propio estado de cobro. Sólo se muestra a quien
 * opera la orden; el responsable se cambia desde «Instalador», no desde acá.
 */
export function OrderTeamPanel({
  orderId,
  currency,
  leadName,
  team,
  roster,
  leadId,
  requiredInstallers,
  showMoney,
}: {
  orderId: string;
  currency: OrderCurrency;
  leadName: string;
  team: OrderTeamMember[];
  roster: { id: string; name: string }[];
  leadId: string;
  requiredInstallers: number;
  showMoney: boolean;
}) {
  const t = useTranslations("OrderTeam");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [candidate, setCandidate] = useState("");

  const taken = new Set([leadId, ...team.map((member) => member.installerId)]);
  const available = roster.filter((member) => !taken.has(member.id));
  const full = team.length + 1 >= MAX_TEAM;
  const staffing = orderStaffing({
    assignedInstallerId: leadId,
    requiredInstallers,
    activeHelpers: team.length,
  });

  const run = (job: () => Promise<{ error: string | null }>, success: string) => {
    startTransition(async () => {
      const res = await job();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  };

  const add = () => {
    if (!candidate) return;
    run(() => addOrderTeamMember(orderId, candidate), t("added"));
    setCandidate("");
  };

  const editAmount = (member: OrderTeamMember) => {
    const raw = window.prompt(t("amountPrompt", { name: member.name }), member.amount?.toString() ?? "");
    if (raw === null) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    run(() => setTeamMemberAmount({ orderId, installerId: member.installerId, amount: value }), t("amountSaved"));
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" aria-hidden="true" />
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("count", { count: team.length + 1, max: MAX_TEAM })}</p>
            <p className={`text-xs ${staffing.incomplete ? "font-medium text-warning" : "text-muted-foreground"}`}>
              {staffing.incomplete
                ? t("incomplete", { missing: staffing.missing, required: staffing.required })
                : t("staffed", { required: staffing.required })}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-5">
        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium">{leadName}</span>
          <span className="text-xs text-muted-foreground">{t("lead")}</span>
        </div>

        {team.length > 0 ? (
          <div className="divide-y rounded-xl border">
            {team.map((member) => (
              <div key={member.installerId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{member.name}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {showMoney ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => editAmount(member)}
                        className="font-mono text-sm underline-offset-2 hover:underline"
                      >
                        {member.amount === null
                          ? t("noAmount")
                          : format.number(member.amount, { style: "currency", currency, maximumFractionDigits: 0 })}
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              setTeamMemberPaymentStatus({
                                orderId,
                                installerId: member.installerId,
                                status: member.paymentStatus === "paid" ? "pending" : "paid",
                              }),
                            t("paymentSaved"),
                          )
                        }
                      >
                        {member.paymentStatus === "paid" ? t("paid") : t("markPaid")}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("removeConfirm", { name: member.name }))) return;
                      run(() => removeOrderTeamMember(orderId, member.installerId), t("removed"));
                    }}
                  >
                    {t("remove")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}

        {full ? (
          <p className="text-xs text-muted-foreground">{t("full")}</p>
        ) : available.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noCandidates")}</p>
        ) : (
          <div className="flex gap-2">
            <select
              value={candidate}
              disabled={pending}
              onChange={(event) => setCandidate(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
            >
              <option value="">{t("pick")}</option>
              {available.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <Button onClick={add} disabled={pending || !candidate}>
              {t("add")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
