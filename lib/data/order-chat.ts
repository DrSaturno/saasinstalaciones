import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type OrderChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

const CHAT_PAGE = 200;

/**
 * Los últimos mensajes del chat grupal de una orden, del más viejo al más
 * nuevo. La RLS decide si esta persona puede leerlos: sin acceso vuelve vacío.
 */
export async function fetchOrderChat(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<OrderChatMessage[]> {
  const { data } = await supabase
    .from("order_chat_messages")
    .select("id, sender_id, sender_name, body, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(CHAT_PAGE);
  return (data ?? [])
    .map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      body: row.body,
      createdAt: row.created_at,
    }))
    .reverse();
}

/**
 * Cuántos ayudantes activos tiene la orden. Sirve para decidir si mostrar el
 * chat grupal: una orden sin equipo sigue usando el hilo 1:1 de siempre. Es una
 * función y no una consulta al plantel porque el responsable no puede leer esas
 * filas por RLS, pero sí necesita saber que el chat existe.
 */
export async function fetchOrderTeamSize(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<number> {
  const { data } = await supabase.rpc("order_team_size", { p_order_id: orderId });
  return typeof data === "number" ? data : 0;
}
