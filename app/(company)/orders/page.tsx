import { createClient } from "@/lib/supabase/server";
import { fetchAllOrders } from "@/lib/data/orders";
import { OrdersTable } from "@/components/company/orders-table";

export default async function OrdersPage() {
  const supabase = await createClient();
  const orders = await fetchAllOrders(supabase);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Órdenes de trabajo</h1>
      <p className="mt-1 text-muted-foreground">
        Cada orden es una instalación en un punto. Seguí su avance y asigná
        instaladores.
      </p>
      <div className="mt-8">
        <OrdersTable orders={orders} />
      </div>
    </div>
  );
}
