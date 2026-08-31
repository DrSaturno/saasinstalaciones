import type { BillingMode, OrderCurrency, OrderStatus, PaymentStatus } from "@/types/database";

/**
 * Dos plata distintas por orden, y conviene no confundirlas nunca:
 *
 * - `amount` es lo que la empresa le cobra a su cliente (ingreso).
 * - `installerAmount` es lo que la empresa le paga al instalador (costo).
 *
 * `paymentStatus` es el pago **al instalador**: es la única lectura que
 * funciona para los dos lados del producto. Para el instalador contesta «¿me
 * pagaron?», y para la empresa, «¿qué le debo a mi gente?».
 */
export type FinanceProjectInput = { id: string; name: string; billingMode: BillingMode; contractAmount: number | null; currency: OrderCurrency };
export type FinanceOrderInput = { id: string; orderNumber: string; title: string; projectId: string; siteId: string; status: OrderStatus; amount: number | null; installerAmount: number | null; paymentStatus: PaymentStatus; currency: OrderCurrency; installerId: string | null; finalizedAt: string | null; scheduledDate: string | null };
export type FinanceBreakdown = { name: string; currency: OrderCurrency; orders: number; contracted: number; completed: number; pending: number; installerCost: number };

/** Una orden terminada que todavía no se le pagó al instalador. */
export type PendingPaymentRow = {
  orderId: string;
  orderNumber: string;
  title: string;
  projectName: string;
  installerName: string;
  installerCost: number;
  currency: OrderCurrency;
  finalizedAt: string | null;
};

export type FinancialOverview = {
  currencies: { currency: OrderCurrency; contracted: number; completed: number; pending: number; average: number; growth: number | null; installerCost: number; margin: number }[];
  projects: (FinanceBreakdown & { id: string; mode: BillingMode; progress: number; margin: number })[];
  zones: FinanceBreakdown[];
  installers: FinanceBreakdown[];
  months: { month: string; currency: OrderCurrency; value: number }[];
  /** Lo que la empresa le debe a sus instaladores, ordenado por antigüedad. */
  pendingPayments: PendingPaymentRow[];
  pendingPaymentTotals: { currency: OrderCurrency; total: number; orders: number }[];
};

type FinanceContext = {
  siteZones: Map<string, string>;
  installerNames: Map<string, string>;
  now?: Date;
  dateFrom?: string;
  dateTo?: string;
};

function addBreakdown(map: Map<string, FinanceBreakdown>, key: string, name: string, currency: OrderCurrency, contracted: number, completed: number, installerCost: number) {
  const value = map.get(key) ?? { name, currency, orders: 0, contracted: 0, completed: 0, pending: 0, installerCost: 0 };
  value.orders++;
  value.contracted += contracted;
  value.completed += completed;
  value.installerCost += installerCost;
  value.pending = Math.max(0, value.contracted - value.completed);
  map.set(key, value);
}

function percentage(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function buildFinancialOverview(projects: FinanceProjectInput[], orders: FinanceOrderInput[], context: FinanceContext): FinancialOverview {
  const now = context.now ?? new Date();
  const currentStart = new Date(now); currentStart.setUTCDate(currentStart.getUTCDate() - 30);
  const previousStart = new Date(currentStart); previousStart.setUTCDate(previousStart.getUTCDate() - 30);
  const liveOrders = orders.filter((order) => order.status !== "cancelada");
  const currencyMap = new Map<OrderCurrency, { contracted: number; completed: number; entities: number; current: number; previous: number; installerCost: number; realizedCost: number }>();
  const projectRows: FinancialOverview["projects"] = [];
  const zoneMap = new Map<string, FinanceBreakdown>();
  const installerMap = new Map<string, FinanceBreakdown>();
  const monthMap = new Map<string, number>();
  const pendingPayments: PendingPaymentRow[] = [];
  const pendingTotals = new Map<OrderCurrency, { total: number; orders: number }>();

  for (const project of projects) {
    const allProjectOrders = liveOrders.filter((order) => order.projectId === project.id);
    const projectOrders = allProjectOrders.filter((order) => {
      if (!context.dateFrom && !context.dateTo) return true;
      const date = order.status === "finalizada"
        ? order.finalizedAt?.slice(0, 10)
        : order.scheduledDate;
      if (!date) return false;
      return (!context.dateFrom || date >= context.dateFrom) &&
        (!context.dateTo || date <= context.dateTo);
    });
    const contracted = project.billingMode === "project"
      ? allProjectOrders.length
        ? (Number(project.contractAmount ?? 0) / allProjectOrders.length) * projectOrders.length
        : 0
      : projectOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
    const share = project.billingMode === "project" && allProjectOrders.length
      ? Number(project.contractAmount ?? 0) / allProjectOrders.length
      : 0;
    let completed = 0;
    // Dos costos, y la diferencia importa: el comprometido es todo lo que se va
    // a pagar por las órdenes del período; el realizado, sólo lo de las
    // terminadas. El margen usa el realizado, porque `completed` también cuenta
    // sólo terminadas — comparar ingreso realizado contra costo comprometido da
    // pérdidas que no existen.
    let projectInstallerCost = 0;
    let projectRealizedCost = 0;

    for (const order of projectOrders) {
      const value = project.billingMode === "project" ? share : Number(order.amount ?? 0);
      const realized = order.status === "finalizada" ? value : 0;
      const installerCost = Number(order.installerAmount ?? 0);
      completed += realized;
      projectInstallerCost += installerCost;
      if (order.status === "finalizada") projectRealizedCost += installerCost;
      const zone = context.siteZones.get(order.siteId) ?? "—";
      addBreakdown(zoneMap, `${project.currency}:${zone}`, zone, project.currency, value, realized, installerCost);
      const installer = order.installerId ? context.installerNames.get(order.installerId) ?? "Instalador" : "Sin asignar";
      addBreakdown(installerMap, `${project.currency}:${installer}`, installer, project.currency, value, realized, installerCost);

      // El trabajo se hizo y todavía no se le pagó: es deuda con el instalador.
      // Se listan sólo las finalizadas — una orden en curso todavía no se debe.
      if (order.status === "finalizada" && order.paymentStatus === "pending") {
        pendingPayments.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          title: order.title,
          projectName: project.name,
          installerName: installer,
          installerCost,
          currency: project.currency,
          finalizedAt: order.finalizedAt,
        });
        const totals = pendingTotals.get(project.currency) ?? { total: 0, orders: 0 };
        totals.total += installerCost;
        totals.orders++;
        pendingTotals.set(project.currency, totals);
      }

      if (realized && order.finalizedAt) {
        const month = order.finalizedAt.slice(0, 7);
        const monthKey = `${project.currency}:${month}`;
        monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + realized);
      }
    }

    const currency = currencyMap.get(project.currency) ?? { contracted: 0, completed: 0, entities: 0, current: 0, previous: 0, installerCost: 0, realizedCost: 0 };
    currency.contracted += contracted;
    currency.completed += completed;
    currency.installerCost += projectInstallerCost;
    currency.realizedCost += projectRealizedCost;
    currency.entities += project.billingMode === "project" ? 1 : Math.max(projectOrders.length, 1);
    for (const order of projectOrders.filter((item) => item.status === "finalizada" && item.finalizedAt)) {
      const value = project.billingMode === "project" ? share : Number(order.amount ?? 0);
      const date = new Date(order.finalizedAt!);
      if (date >= currentStart && date <= now) currency.current += value;
      else if (date >= previousStart && date < currentStart) currency.previous += value;
    }
    currencyMap.set(project.currency, currency);
    projectRows.push({
      id: project.id, name: project.name, currency: project.currency, mode: project.billingMode,
      orders: projectOrders.length, contracted, completed,
      pending: Math.max(0, contracted - completed),
      progress: contracted ? Math.round((completed / contracted) * 100) : 0,
      installerCost: projectInstallerCost,
      // Ingreso y costo de lo TERMINADO: los dos lados del mismo momento.
      margin: completed - projectRealizedCost,
    });
  }

  return {
    currencies: [...currencyMap.entries()].map(([currency, value]) => ({ currency, contracted: value.contracted, completed: value.completed, pending: Math.max(0, value.contracted - value.completed), average: value.entities ? value.contracted / value.entities : 0, growth: percentage(value.current, value.previous), installerCost: value.installerCost, margin: value.completed - value.realizedCost })),
    projects: projectRows.sort((a, b) => b.contracted - a.contracted),
    zones: [...zoneMap.values()].sort((a, b) => b.contracted - a.contracted),
    installers: [...installerMap.values()].sort((a, b) => b.completed - a.completed),
    months: [...monthMap.entries()].map(([key, value]) => { const [currency, month] = key.split(":"); return { currency: currency as OrderCurrency, month, value }; }).sort((a, b) => a.month.localeCompare(b.month)),
    // Lo más viejo primero: es la deuda que más urge saldar.
    pendingPayments: pendingPayments.sort((a, b) => (a.finalizedAt ?? "").localeCompare(b.finalizedAt ?? "")),
    pendingPaymentTotals: [...pendingTotals.entries()].map(([currency, value]) => ({ currency, total: value.total, orders: value.orders })),
  };
}
