import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types/database";

export default async function FinanceOrdersPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; project?: string; client?: string; zone?: string; installer?: string; from?: string; to?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) redirect("/dashboard");
  const [t, statusT, params, supabase] = await Promise.all([
    getTranslations("FinanceOperations"), getTranslations("Status.order"), searchParams, createClient(),
  ]);
  const companyId = user.companyId;
  const [projectsResult, rosterResult, clientsResult] = await Promise.all([
    supabase.from("projects").select("id,name,client_id,client_name")
      .eq("company_id", companyId).order("name"),
    supabase.from("company_installers").select("installer_id")
      .eq("company_id", companyId).eq("status", "active"),
    supabase.from("clients").select("id,name").eq("company_id", companyId).order("name"),
  ]);
  const projects = projectsResult.data ?? [];
  const rosterIds = (rosterResult.data ?? []).map((row) => row.installer_id);
  const { data: installers } = rosterIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", rosterIds)
    : { data: [] as { id: string; full_name: string }[] };
  let query = supabase.from("work_orders")
    .select("id,order_number,title,status,scheduled_date,finalized_at,amount,currency,project_id,site_id,assigned_installer_id,projects!inner(client_id),sites!inner(zone)", { count: "exact" })
    .eq("company_id", companyId).order("created_at", { ascending: false });
  if (params.q?.trim()) query = query.ilike("order_number", `%${params.q.trim().slice(0, 50)}%`);
  if (params.project && projects.some((p) => p.id === params.project)) query = query.eq("project_id", params.project);
  if (params.client && (clientsResult.data ?? []).some((client) => client.id === params.client)) {
    query = query.eq("projects.client_id", params.client);
  }
  if (params.zone === "AMBA" || params.zone === "Interior") {
    query = query.eq("sites.zone", params.zone);
  }
  if (params.installer && rosterIds.includes(params.installer)) query = query.eq("assigned_installer_id", params.installer);
  if (["pendiente", "relevamiento", "planificada", "en_camino", "en_sitio", "en_proceso", "en_revision", "finalizada", "cancelada"].includes(params.status ?? "")) query = query.eq("status", params.status as OrderStatus);
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "")) query = query.gte("scheduled_date", params.from!);
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "")) query = query.lte("scheduled_date", params.to!);
  const page = Math.max(0, Math.min(10000, Number.parseInt(params.page ?? "0", 10) || 0));
  const { data: orders, count, error } = await query.range(page * 50, page * 50 + 49);
  if (error) return <main className="p-5"><h1 className="text-2xl font-bold">{t("financeOrders")}</h1><p>{t("ordersLoadError")}</p></main>;
  const siteIds = [...new Set((orders ?? []).map((order) => order.site_id))];
  const orderIds = (orders ?? []).map((order) => order.id);
  const [sitesResult, balancesResult] = await Promise.all([
    siteIds.length ? supabase.from("sites").select("id,name,city,zone")
      .eq("company_id", companyId).in("id", siteIds) : Promise.resolve({ data: [] as { id: string; name: string; city: string; zone: string }[] }),
    orderIds.length ? supabase.from("finance_entry_balances")
      .select("order_id,direction,amount,open_amount,currency")
      .eq("company_id", companyId).in("order_id", orderIds).neq("status", "void")
      : Promise.resolve({ data: [] as { order_id: string | null; direction: string; amount: number; open_amount: number; currency: string }[] }),
  ]);
  const siteById = new Map((sitesResult.data ?? []).map((site) => [site.id, site]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const installerById = new Map((installers ?? []).map((person) => [person.id, person.full_name]));
  const balances = new Map<string, { payable: number; receivable: number }>();
  for (const row of balancesResult.data ?? []) {
    if (!row.order_id) continue;
    const sum = balances.get(row.order_id) ?? { payable: 0, receivable: 0 };
    sum[row.direction === "payable" ? "payable" : "receivable"] += row.open_amount;
    balances.set(row.order_id, sum);
  }
  const money = (value: number, currency: string) => new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(value);
  const queryString = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== "page" && value) as [string, string][]);
  return <main className="mx-auto max-w-[1480px] space-y-5 pb-12">
    <header><Link href="/finance" className="text-sm text-primary">← {t("back")}</Link>
      <h1 className="mt-2 text-2xl font-bold">{t("financeOrders")}</h1>
      <p className="text-sm text-muted-foreground">{t("financeOrdersHint")}</p></header>
    <form className="grid gap-2 rounded-xl border bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <input name="q" defaultValue={params.q ?? ""} placeholder={t("orderNumber")} aria-label={t("orderNumber")} className="rounded-md border p-2" />
      <select name="client" defaultValue={params.client ?? ""} aria-label={t("client")} className="rounded-md border p-2"><option value="">{t("allClients")}</option>
        {(clientsResult.data ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      <select name="project" defaultValue={params.project ?? ""} aria-label={t("project")} className="rounded-md border p-2"><option value="">{t("allProjects")}</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
      <select name="installer" defaultValue={params.installer ?? ""} aria-label={t("installer")} className="rounded-md border p-2"><option value="">{t("allInstallers")}</option>
        {(installers ?? []).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select>
      <select name="zone" defaultValue={params.zone ?? ""} aria-label={t("zone")} className="rounded-md border p-2"><option value="">{t("allZones")}</option><option value="AMBA">AMBA</option><option value="Interior">{t("interior")}</option></select>
      <select name="status" defaultValue={params.status ?? ""} aria-label={t("status")} className="rounded-md border p-2"><option value="">{t("allStatuses")}</option>
        {(["pendiente", "relevamiento", "planificada", "en_camino", "en_sitio", "en_proceso", "en_revision", "finalizada", "cancelada"] as const).map((status) =>
          <option key={status} value={status}>{statusT(status)}</option>)}</select>
      <input name="from" type="date" defaultValue={params.from ?? ""} aria-label={t("from")} className="rounded-md border p-2" />
      <input name="to" type="date" defaultValue={params.to ?? ""} aria-label={t("to")} className="rounded-md border p-2" />
      <button className="rounded-md bg-primary px-4 py-2 font-semibold text-white">{t("filter")}</button>
    </form>
    <p className="text-xs text-muted-foreground">{t("orderCount", { count: count ?? 0 })}</p>
    <section className="space-y-2">{(orders ?? []).map((order) => {
      const site = siteById.get(order.site_id);
      const project = projectById.get(order.project_id);
      const balance = balances.get(order.id);
      return <Link key={order.id} href={`/finance/orders/${order.id}`} className="grid gap-2 rounded-xl border bg-white p-4 hover:border-primary/40 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center">
        <div><p className="font-mono text-xs font-semibold text-primary">{order.order_number}</p><p className="font-semibold">{order.title}</p>
          <p className="text-xs text-muted-foreground">{project?.client_name ?? "—"} · {site?.name ?? "—"} · {site?.zone ?? "—"}</p></div>
        <div className="text-sm"><p>{t("status")}: {statusT(order.status)}</p><p className="text-muted-foreground">{installerById.get(order.assigned_installer_id ?? "") ?? t("unassigned")}</p></div>
        <div className="text-sm"><p>{t("amount")}: {order.amount == null ? "—" : money(order.amount, order.currency)}</p>
          <p className="text-muted-foreground">{t("openPayables")}: {money(balance?.payable ?? 0, order.currency)}</p></div>
        <span className="text-sm font-semibold text-primary">{t("open")} →</span>
      </Link>;
    })}</section>
    <nav className="flex gap-3 text-sm">{page > 0 && <Link href={`/finance/orders?${queryString}&page=${page - 1}`} className="text-primary">← {t("previousPage")}</Link>}
      {(count ?? 0) > (page + 1) * 50 && <Link href={`/finance/orders?${queryString}&page=${page + 1}`} className="text-primary">{t("nextPage")} →</Link>}</nav>
  </main>;
}
