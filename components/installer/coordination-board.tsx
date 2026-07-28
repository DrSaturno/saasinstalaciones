"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { recordSurvey, transitionOrder } from "@/lib/actions/orders";
import { ORDER_TRANSITIONS } from "@/lib/domain/transitions";
import { allowedTransitions } from "@/lib/domain/order-rules";
import { Textarea } from "@/components/ui/textarea";
import { ViewToggle, useViewMode } from "@/components/shared/view-toggle";
import { ORDER_STATUS } from "@/lib/domain/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/types/database";

const STATUS_ORDER = Object.keys(ORDER_STATUS) as OrderStatus[];

export type CoordinationOrder = {
  id: string;
  orderNumber: string;
  title: string;
  status: OrderStatus;
  scheduledDate: string | null;
  projectName: string;
  installerId: string | null;
  installerName: string;
  acceptedAt: string | null;
  hasSurvey: boolean;
};

/**
 * Órdenes del equipo, para el coordinador. Mobile-first: se opera desde el
 * teléfono. Las transiciones reutilizan `transitionOrder`, que valida contra la
 * máquina de estados (y la DB la vuelve a validar con su trigger).
 */
export function CoordinationBoard({
  orders,
  viewerId,
}: {
  orders: CoordinationOrder[];
  viewerId: string;
}) {
  const t = useTranslations("Coordination");
  const statusT = useTranslations("Status");
  const common = useTranslations("Common");
  const [mode, setMode] = useViewMode("view:coordination", "board");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");

  const counts = useMemo(() => {
    const map = new Map<OrderStatus, number>();
    for (const order of orders) {
      map.set(order.status, (map.get(order.status) ?? 0) + 1);
    }
    return map;
  }, [orders]);

  // Lo que espera confirmación va primero: es el trabajo del coordinador.
  const visible = useMemo(() => {
    const list = filter === "all" ? orders : orders.filter((o) => o.status === filter);
    return [...list].sort((a, b) => {
      const review = (o: CoordinationOrder) => (o.status === "en_revision" ? 0 : 1);
      return review(a) - review(b);
    });
  }, [orders, filter]);

  // Las acciones disponibles salen de las reglas de negocio: si una regla las
  // bloquea, el botón no aparece en vez de fallar al tocarlo.
  const options = (order: CoordinationOrder) =>
    allowedTransitions(
      {
        status: order.status,
        assignedInstallerId: order.installerId,
        acceptedAt: order.acceptedAt,
        hasSurvey: order.hasSurvey,
        scheduledDate: order.scheduledDate,
      },
      { id: viewerId, role: "coordinator" },
      ORDER_TRANSITIONS[order.status],
    );

  const move = (order: CoordinationOrder, to: OrderStatus) => {
    if (to === "cancelada" && !window.confirm(t("cancelConfirm", { number: order.orderNumber }))) {
      return;
    }
    startTransition(async () => {
      const res = await transitionOrder(order.id, to);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        t("moved", { number: order.orderNumber, status: statusT(ORDER_STATUS[to].key) }),
      );
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            filter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card"
          }`}
        >
          {t("filterAll")} <span className="font-mono">{orders.length}</span>
        </button>
        {STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(filter === status ? "all" : status)}
            aria-pressed={filter === status}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === status ? "border-primary" : "bg-card hover:border-primary/40"
            }`}
            style={
              filter === status
                ? { backgroundColor: ORDER_STATUS[status].bg, color: ORDER_STATUS[status].fg }
                : undefined
            }
          >
            {statusT(ORDER_STATUS[status].key)}{" "}
            <span className="font-mono">{counts.get(status)}</span>
          </button>
        ))}
        </div>
        <ViewToggle
          value={mode}
          onChange={setMode}
          labels={{ list: common("viewList"), board: common("viewBoard") }}
        />
      </div>

      <div className={mode === "board" ? "mt-4 grid gap-3 lg:grid-cols-2" : "mt-4 overflow-hidden rounded-xl border bg-card"}>
        {visible.length === 0 ? (
          <div className="rounded-xl border bg-card py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          visible.map((order) => (
            <div
              key={order.id}
              className={
                mode === "board"
                  ? "rounded-xl border bg-card p-4"
                  : "border-b p-4 last:border-b-0"
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{order.orderNumber}</p>
                  <Link href={`/coordination/${order.id}`} className="font-medium hover:text-primary">
                    {order.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{order.projectName}</p>
                </div>
                <Badge
                  variant="secondary"
                  className="shrink-0"
                  style={{
                    backgroundColor: ORDER_STATUS[order.status].bg,
                    color: ORDER_STATUS[order.status].fg,
                  }}
                >
                  {statusT(ORDER_STATUS[order.status].key)}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {order.scheduledDate ? (
                  <span className="font-mono">
                    {format.dateTime(new Date(order.scheduledDate), {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                ) : null}
                {order.installerId ? (
                  <Link
                    href={`/messages/${order.installerId}`}
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    <MessageSquare className="size-3.5" />
                    {order.installerName || t("chat")}
                  </Link>
                ) : (
                  <span>{t("unassigned")}</span>
                )}
              </div>

              {order.status === "relevamiento" && !order.hasSurvey ? (
                <SurveyForm orderId={order.id} orderNumber={order.orderNumber} />
              ) : null}

              {options(order).length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {options(order).map((to) => (
                    <Button
                      key={to}
                      size="sm"
                      variant={to === "finalizada" ? "default" : to === "cancelada" ? "ghost" : "outline"}
                      onClick={() => move(order, to)}
                      disabled={pending}
                    >
                      {t(`to.${to}`)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** Acta de relevamiento: sin ella la orden no puede pasar a planificada. */
function SurveyForm({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const t = useTranslations("Coordination");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const res = await recordSurvey({ orderId, note });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("surveySaved", { number: orderNumber }));
      setNote("");
      router.refresh();
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-dashed p-3">
      <p className="text-xs font-medium">{t("surveyTitle")}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("surveyHelp")}</p>
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        className="mt-2"
        placeholder={t("surveyPlaceholder")}
        disabled={pending}
      />
      <Button
        size="sm"
        className="mt-2"
        onClick={save}
        disabled={pending || note.trim().length < 3}
      >
        {t("surveySave")}
      </Button>
    </div>
  );
}
