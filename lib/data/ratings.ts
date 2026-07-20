import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type RatingReview = {
  id: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  orderNumber: string | null;
  orderTitle: string | null;
};

export type InstallerReputation = {
  ratingAvg: number;
  ratingCount: number;
  zones: string[];
  skills: string[];
  available: boolean;
  reviews: RatingReview[];
};

/** Reputación global del instalador autenticado, con sus reseñas más recientes. */
export async function fetchInstallerReputation(
  supabase: SupabaseClient<Database>,
  installerId: string,
): Promise<InstallerReputation | null> {
  const [{ data: installer }, { data: ratings }] = await Promise.all([
    supabase
      .from("installers")
      .select("rating_avg, rating_count, zones, skills, available")
      .eq("id", installerId)
      .single(),
    supabase
      .from("ratings")
      .select("id, order_id, stars, comment, created_at")
      .eq("installer_id", installerId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!installer) return null;

  const orderIds = (ratings ?? []).map((rating) => rating.order_id);
  const orderById = new Map<
    string,
    { order_number: string; title: string }
  >();

  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("work_orders")
      .select("id, order_number, title")
      .in("id", orderIds);
    for (const order of orders ?? []) orderById.set(order.id, order);
  }

  return {
    ratingAvg: Number(installer.rating_avg),
    ratingCount: installer.rating_count,
    zones: installer.zones,
    skills: installer.skills,
    available: installer.available,
    reviews: (ratings ?? []).map((rating) => {
      const order = orderById.get(rating.order_id);
      return {
        id: rating.id,
        stars: rating.stars,
        comment: rating.comment,
        createdAt: rating.created_at,
        orderNumber: order?.order_number ?? null,
        orderTitle: order?.title ?? null,
      };
    }),
  };
}
