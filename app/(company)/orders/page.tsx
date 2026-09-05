import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { fetchAllOrders, fetchActiveRoster } from "@/lib/data/orders";
import {
  fetchCompanyCurrency,
  fetchOrderFormProjects,
} from "@/lib/data/order-form";
import { CreateOrderDialog } from "@/components/company/create-order-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { OrdersTable } from "@/components/company/orders-table";
import { getCurrentUser } from "@/lib/auth";

export default async function OrdersPage() {
  const supabase = await createClient();
  const [t, orders, projects, roster, currency, user] = await Promise.all([
    getTranslations("Orders"),
    fetchAllOrders(supabase),
    fetchOrderFormProjects(supabase),
    fetchActiveRoster(supabase),
    fetchCompanyCurrency(supabase),
    getCurrentUser(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <CreateOrderDialog
            projects={projects}
            roster={roster}
            currency={currency}
            canManageFinance={user?.role === "company_manager"}
          />
        }
      />
      <div className="mt-6">
        <OrdersTable orders={orders} showAmounts={user?.role === "company_manager"} />
      </div>
    </PageContainer>
  );
}
