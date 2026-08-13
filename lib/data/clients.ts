import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

const PAGE = 1000;
const ID_BATCH = 200;

type ClientLocation = Pick<
  Tables<"locations">,
  "id" | "client_id" | "name" | "address" | "city" | "state" | "zone" | "external_ref"
>;

async function fetchAllLocations(
  supabase: SupabaseClient<Database>,
  clientId?: string,
): Promise<ClientLocation[]> {
  const rows: ClientLocation[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("locations")
      .select("id, client_id, name, address, city, state, zone, external_ref")
      .is("archived_at", null)
      .order("name")
      .range(from, from + PAGE - 1);
    if (clientId) query = query.eq("client_id", clientId);
    const { data, error } = await query;
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

export type ClientSummary = {
  id: string;
  name: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  website: string;
  instagram: string;
  youtube: string;
  tiktok: string;
  projectCount: number;
  siteCount: number;
};

export async function fetchClients(
  supabase: SupabaseClient<Database>,
): Promise<ClientSummary[]> {
  const [{ data: clients }, { data: projects }, locations] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, tax_id, contact_name, email, phone, address, notes, website, instagram, youtube, tiktok")
        .order("name"),
      supabase.from("projects").select("id, client_id"),
      fetchAllLocations(supabase),
    ]);
  const projectsByClient = new Map<string, number>();
  const sitesByClient = new Map<string, number>();
  for (const project of projects ?? []) {
    if (project.client_id) {
      projectsByClient.set(
        project.client_id,
        (projectsByClient.get(project.client_id) ?? 0) + 1,
      );
    }
  }
  for (const location of locations ?? []) {
    sitesByClient.set(
      location.client_id,
      (sitesByClient.get(location.client_id) ?? 0) + 1,
    );
  }
  return (clients ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    taxId: client.tax_id,
    contactName: client.contact_name,
    email: client.email,
    phone: client.phone,
    address: client.address,
    notes: client.notes,
    website: client.website,
    instagram: client.instagram,
    youtube: client.youtube,
    tiktok: client.tiktok,
    projectCount: projectsByClient.get(client.id) ?? 0,
    siteCount: sitesByClient.get(client.id) ?? 0,
  }));
}

export async function fetchClientDetail(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (!client) return null;
  const [{ data: projects }, locations] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    fetchAllLocations(supabase, clientId),
  ]);
  const locationIds = locations.map((location) => location.id);
  if (!locationIds.length) {
    return { client, projects: projects ?? [], locations: [], orders: [] };
  }
  const sites: { id: string; location_id: string | null }[] = [];
  for (let index = 0; index < locationIds.length; index += ID_BATCH) {
    const { data } = await supabase
      .from("sites")
      .select("id, location_id")
      .in("location_id", locationIds.slice(index, index + ID_BATCH));
    sites.push(...(data ?? []));
  }
  const locationBySite = new Map(
    sites
      .filter((site): site is typeof site & { location_id: string } => Boolean(site.location_id))
      .map((site) => [site.id, site.location_id]),
  );
  const siteIds = [...locationBySite.keys()];
  const orders: {
    id: string;
    site_id: string;
    order_number: string;
    title: string;
    status: Tables<"work_orders">["status"];
    scheduled_date: string | null;
    finalized_at: string | null;
  }[] = [];
  for (let index = 0; index < siteIds.length; index += ID_BATCH) {
    const { data } = await supabase
      .from("work_orders")
      .select("id, site_id, order_number, title, status, scheduled_date, finalized_at")
      .in("site_id", siteIds.slice(index, index + ID_BATCH))
      .order("created_at", { ascending: false });
    orders.push(...(data ?? []));
  }
  return {
    client,
    projects: projects ?? [],
    locations,
    orders: orders.map((order) => ({
      ...order,
      location_id: locationBySite.get(order.site_id) ?? null,
    })),
  };
}
