import type { OrderCurrency, OrderStatus, PaymentStatus } from "@/types/database";

/**
 * Los ingresos de un instalador, sumando TODAS las empresas para las que
 * trabaja.
 *
 * Es la perspectiva opuesta a `lib/domain/finance.ts`, que mira una empresa y
 * todos sus instaladores. Acá se mira una persona y todas sus empresas — por
 * eso vive aparte y no como una función más de aquel archivo.
 *
 * `amount` es siempre lo que le pagan a él. Lo que la empresa le cobra a su
 * cliente no aparece por ningún lado: no es asunto suyo, y la vista de base de
 * datos `installer_earnings` hace que ni siquiera pueda llegar hasta acá.
 */
export type InstallerEarningInput = {
  orderId: string;
  orderNumber: string;
  title: string;
  companyId: string;
  status: OrderStatus;
  amount: number | null;
  currency: OrderCurrency;
  paymentStatus: PaymentStatus;
  finalizedAt: string | null;
  scheduledDate: string | null;
};

export type InstallerEarningRow = {
  orderId: string;
  orderNumber: string;
  title: string;
  companyName: string;
  amount: number;
  currency: OrderCurrency;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** La fecha que corresponde: cuándo se terminó, o cuándo está programada. */
  date: string | null;
};

export type InstallerEarningsFilters = {
  companyId?: string;
  from?: string;
  to?: string;
  orderNumber?: string;
  paymentStatus?: PaymentStatus;
};

export type InstallerEarningsOverview = {
  /** Un total por moneda: nunca se suman pesos con reales. */
  totals: {
    currency: OrderCurrency;
    earned: number;
    paid: number;
    unpaid: number;
    doneOrders: number;
    paidOrders: number;
    unpaidOrders: number;
  }[];
  rows: InstallerEarningRow[];
  /** Empresas con trabajo del instalador, para poblar el filtro. */
  companies: { id: string; name: string }[];
};

function rowDate(order: InstallerEarningInput): string | null {
  return order.status === "finalizada"
    ? (order.finalizedAt?.slice(0, 10) ?? null)
    : order.scheduledDate;
}

export function buildInstallerEarnings(
  orders: InstallerEarningInput[],
  context: {
    companyNames: Map<string, string>;
    fallbackCompanyName: string;
    filters?: InstallerEarningsFilters;
  },
): InstallerEarningsOverview {
  const filters = context.filters ?? {};
  const named = (companyId: string) =>
    context.companyNames.get(companyId) ?? context.fallbackCompanyName;

  // Una orden cancelada no le debe nada a nadie.
  const live = orders.filter((order) => order.status !== "cancelada");

  // Las empresas del filtro salen de TODO su trabajo, no de lo filtrado: si
  // saliera de lo filtrado, elegir una empresa borraría las demás de la lista y
  // no habría forma de volver.
  const companies = [...new Set(live.map((order) => order.companyId))]
    .map((id) => ({ id, name: named(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const wanted = live.filter((order) => {
    if (filters.companyId && order.companyId !== filters.companyId) return false;
    if (filters.paymentStatus && order.paymentStatus !== filters.paymentStatus) return false;
    if (
      filters.orderNumber &&
      !order.orderNumber.toLowerCase().includes(filters.orderNumber.trim().toLowerCase())
    ) {
      return false;
    }
    if (filters.from || filters.to) {
      const date = rowDate(order);
      if (!date) return false;
      if (filters.from && date < filters.from) return false;
      if (filters.to && date > filters.to) return false;
    }
    return true;
  });

  const totalsMap = new Map<OrderCurrency, InstallerEarningsOverview["totals"][number]>();
  for (const order of wanted) {
    const amount = Number(order.amount ?? 0);
    const totals = totalsMap.get(order.currency) ?? {
      currency: order.currency,
      earned: 0, paid: 0, unpaid: 0,
      doneOrders: 0, paidOrders: 0, unpaidOrders: 0,
    };
    // Sólo cuenta como ingreso lo que ya se trabajó: una orden asignada para la
    // semana que viene no es plata ganada todavía.
    if (order.status === "finalizada") {
      totals.earned += amount;
      totals.doneOrders++;
      if (order.paymentStatus === "paid") {
        totals.paid += amount;
        totals.paidOrders++;
      } else {
        totals.unpaid += amount;
        totals.unpaidOrders++;
      }
    }
    totalsMap.set(order.currency, totals);
  }

  const rows = wanted
    .map((order) => ({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      title: order.title,
      companyName: named(order.companyId),
      amount: Number(order.amount ?? 0),
      currency: order.currency,
      status: order.status,
      paymentStatus: order.paymentStatus,
      date: rowDate(order),
    }))
    // Lo más reciente arriba: es lo que uno va a mirar primero.
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return { totals: [...totalsMap.values()], rows, companies };
}
