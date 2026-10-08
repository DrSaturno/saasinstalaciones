import type { BillingMode, OrderCurrency, OrderStatus, PaymentStatus, ProjectStatus } from "@/types/database";

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
/**
 * `status` llega hasta acá porque la deuda con el instalador no se puede
 * decidir afuera: el fetcher ya no puede descartar borradores en la consulta
 * sin esconder plata que se debe. Lo decide esta función, sección por sección.
 */
export type FinanceProjectInput = {
  id: string;
  name: string;
  status: ProjectStatus;
  billingMode: BillingMode;
  contractAmount: number | null;
  currency: OrderCurrency;
  /** Gastos manuales ya cargados (bloque 6). Default 0 en el fetcher. */
  otherCosts?: number;
};
/** Un ayudante activo de la orden (bloque 5), con su propio monto y su propio cobro. */
export type FinanceTeamMember = { installerId: string; amount: number | null; paymentStatus: PaymentStatus };
export type FinanceOrderInput = { id: string; orderNumber: string; title: string; projectId: string; siteId: string; status: OrderStatus; amount: number | null; installerAmount: number | null; /** Costo de los ayudantes activos (bloque 5), aparte del responsable. Si viene `team`, se deriva de ahí. */ teamCost?: number; /** Ayudantes activos: permite atribuir costo y pagos pendientes a cada persona. */ team?: FinanceTeamMember[]; paymentStatus: PaymentStatus; currency: OrderCurrency; installerId: string | null; finalizedAt: string | null; scheduledDate: string | null };
export type FinanceBreakdown = { name: string; currency: OrderCurrency; orders: number; contracted: number; completed: number; pending: number; installerCost: number };

/** Una orden terminada que todavía no se le pagó al instalador. */
export type PendingPaymentRow = {
  /** Presente cuando la deuda es de un ayudante y no del responsable (bloque 5). */
  memberInstallerId?: string;
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
  projects: (FinanceBreakdown & {
    id: string;
    mode: BillingMode;
    progress: number;
    margin: number;
    /** Gastos manuales del proyecto (bloque 6). */
    otherCosts: number;
    /** `finalizadas ÷ (total − canceladas)`, para la torta de avance. */
    completionRate: number;
  })[];
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
    const otherCosts = project.otherCosts ?? 0;
    // Sale de TODAS las órdenes vivas del proyecto, no de las del período: el
    // avance de un proyecto no depende de qué rango de fechas esté mirando
    // ahora mismo la pantalla de finanzas.
    const finalizedCount = allProjectOrders.filter((order) => order.status === "finalizada").length;
    const completionRate = allProjectOrders.length
      ? Math.round((finalizedCount / allProjectOrders.length) * 100)
      : 0;

    // La deuda con el instalador no caduca con el filtro de período ni depende
    // de en qué estado esté el proyecto: una orden terminada y sin pagar es
    // plata que se le debe, aunque el proyecto siga en borrador, esté pausado
    // o falte mucho para cerrarlo. Cuando el proyecto se cobra entero al
    // cliente (`billing_mode = 'project'`) esto es lo normal, no la excepción:
    // los instaladores cobran por trabajo hecho mucho antes de que la empresa
    // le facture a su cliente.
    //
    // Por eso esta pasada va ANTES del recorte por fecha y antes de descartar
    // borradores, y recorre `allProjectOrders`. Tiene que coincidir con lo que
    // el instalador ve en «Mis ingresos», que sale de `installer_earnings` y no
    // sabe nada de períodos ni de estados de proyecto: si acá se filtrara de
    // más, la empresa no vería —ni podría saldar— una deuda que la otra
    // persona sí tiene en pantalla. Esa discrepancia se reportó desde el uso.
    for (const order of allProjectOrders) {
      if (order.status !== "finalizada" || order.paymentStatus !== "pending") continue;
      const installerCost = Number(order.installerAmount ?? 0);
      const installer = order.installerId
        ? context.installerNames.get(order.installerId) ?? "Instalador"
        : "Sin asignar";
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

    // Cada ayudante cobra por su cuenta: su deuda es suya, no del responsable.
    for (const order of allProjectOrders) {
      if (order.status !== "finalizada") continue;
      for (const member of order.team ?? []) {
        if (member.paymentStatus !== "pending") continue;
        const installerCost = Number(member.amount ?? 0);
        pendingPayments.push({
          memberInstallerId: member.installerId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          title: order.title,
          projectName: project.name,
          installerName: context.installerNames.get(member.installerId) ?? "Instalador",
          installerCost,
          currency: project.currency,
          finalizedAt: order.finalizedAt,
        });
        const totals = pendingTotals.get(project.currency) ?? { total: 0, orders: 0 };
        totals.total += installerCost;
        totals.orders++;
        pendingTotals.set(project.currency, totals);
      }
    }

    // Un borrador todavía no es trabajo comprometido, así que no entra en las
    // métricas del período. Su deuda ya quedó contada arriba, que es lo único
    // que se le debe a alguien aunque el proyecto no esté confirmado.
    if (project.status === "draft") continue;

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
      // Responsable + ayudantes: es lo que la empresa gasta en gente por esta orden.
      const teamCost = order.team
        ? order.team.reduce((sum, member) => sum + Number(member.amount ?? 0), 0)
        : Number(order.teamCost ?? 0);
      const installerCost = Number(order.installerAmount ?? 0) + teamCost;
      completed += realized;
      projectInstallerCost += installerCost;
      if (order.status === "finalizada") projectRealizedCost += installerCost;
      const zone = context.siteZones.get(order.siteId) ?? "—";
      addBreakdown(zoneMap, `${project.currency}:${zone}`, zone, project.currency, value, realized, installerCost);
      const installer = order.installerId ? context.installerNames.get(order.installerId) ?? "Instalador" : "Sin asignar";
      // El ingreso de la orden y su costo de responsable van al responsable; cada
      // ayudante suma la orden y su propio costo, sin ingreso (no hay forma
      // honesta de repartirlo). Por eso, sumando personas, `orders` puede pasar
      // el total de órdenes.
      addBreakdown(installerMap, `${project.currency}:${installer}`, installer, project.currency, value, realized, Number(order.installerAmount ?? 0));
      for (const member of order.team ?? []) {
        const helper = context.installerNames.get(member.installerId) ?? "Instalador";
        addBreakdown(installerMap, `${project.currency}:${helper}`, helper, project.currency, 0, 0, Number(member.amount ?? 0));
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
    currency.realizedCost += projectRealizedCost + otherCosts;
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
      otherCosts,
      completionRate,
      // Ingreso y costo de lo TERMINADO (instaladores + otros gastos): los dos
      // lados del mismo momento.
      margin: completed - projectRealizedCost - otherCosts,
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
