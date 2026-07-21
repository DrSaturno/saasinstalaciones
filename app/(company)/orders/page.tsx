import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { fetchAllOrders, fetchActiveRoster } from "@/lib/data/orders";
import {
  fetchCompanyCurrency,
  fetchOrderFormProjects,
} from "@/lib/data/order-form";
import { CreateOrderDialog } from "@/components/company/create-order-dialog";
import { OrdersTable } from "@/components/company/orders-table";

export default async function OrdersPage() {
  const supabase = await createClient();
  const [t, orders, projects, roster, currency] = await Promise.all([
    getTranslations("Orders"),
    fetchAllOrders(supabase),
    fetchOrderFormProjects(supabase),
    fetchActiveRoster(supabase),
    fetchCompanyCurrency(supabase),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("description")}</p>
        </div>
        <CreateOrderDialog projects={projects} roster={roster} currency={currency} />
      </div>
      <div className="mt-8">
        <OrdersTable orders={orders} />
      </div>
    </div>
  );
}
