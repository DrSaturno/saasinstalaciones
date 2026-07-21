import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { fetchAllOrders } from "@/lib/data/orders";
import { OrdersTable } from "@/components/company/orders-table";

export default async function OrdersPage() {
  const t = await getTranslations("Orders");
  const supabase = await createClient();
  const orders = await fetchAllOrders(supabase);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-muted-foreground">
        {t("description")}
      </p>
      <div className="mt-8">
        <OrdersTable orders={orders} />
      </div>
    </div>
  );
}
