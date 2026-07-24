import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ClientSummary = {
  id: string;
  name: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  projectCount: number;
  siteCount: number;
};

export async function fetchClients(
  supabase: SupabaseClient<Database>,
): Promise<ClientSummary[]> {
  const [{ data: clients }, { data: projects }, { data: sites }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, tax_id, contact_name, email, phone, address, notes")
        .order("name"),
      supabase.from("projects").select("id, client_id"),
      supabase.from("sites").select("project_id").is("archived_at", null),
    ]);
  const projectClient = new Map(
    (projects ?? []).map((project) => [project.id, project.client_id]),
  );
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
  for (const site of sites ?? []) {
    const clientId = projectClient.get(site.project_id);
    if (clientId) {
      sitesByClient.set(clientId, (sitesByClient.get(clientId) ?? 0) + 1);
    }
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
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  const projectIds = (projects ?? []).map((project) => project.id);
  if (!projectIds.length) return { client, projects: [], sites: [], orders: [] };
  const { data: sites } = await supabase
    .from("sites")
    .select("id, project_id, name, address, city, state, zone, status")
    .in("project_id", projectIds)
    .is("archived_at", null)
    .order("name");
  const siteIds = (sites ?? []).map((site) => site.id);
  const { data: orders } = siteIds.length
    ? await supabase
        .from("work_orders")
        .select("id, site_id, order_number, title, status, scheduled_date, finalized_at")
        .in("site_id", siteIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  return { client, projects: projects ?? [], sites: sites ?? [], orders: orders ?? [] };
}
