import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Country, Database } from "@/types/database";

export type AvailabilityCompany = {
  id: string;
  name: string;
  country: Country;
  weekly: { id: string; weekday: number; startsAt: string; endsAt: string; timezone: string }[];
  exceptions: { id: string; startsAt: string; endsAt: string; reason: string }[];
};

export async function fetchInstallerAvailability(supabase: SupabaseClient<Database>, installerId: string): Promise<AvailabilityCompany[]> {
  const { data: roster } = await supabase.from("company_installers").select("company_id").eq("installer_id", installerId).eq("status", "active");
  const companyIds = (roster ?? []).map((item) => item.company_id);
  if (!companyIds.length) return [];
  const [{ data: companies }, { data: weekly }, { data: exceptions }] = await Promise.all([
    supabase.from("companies").select("id, name, country").in("id", companyIds),
    supabase.from("installer_weekly_availability").select("id, company_id, weekday, starts_at, ends_at, timezone").eq("installer_id", installerId).in("company_id", companyIds).order("weekday"),
    supabase.from("installer_unavailability").select("id, company_id, starts_at, ends_at, reason").eq("installer_id", installerId).in("company_id", companyIds).gte("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  return (companies ?? []).map((company) => ({
    id: company.id,
    name: company.name,
    country: company.country,
    weekly: (weekly ?? []).filter((item) => item.company_id === company.id).map((item) => ({ id: item.id, weekday: item.weekday, startsAt: item.starts_at.slice(0, 5), endsAt: item.ends_at.slice(0, 5), timezone: item.timezone })),
    exceptions: (exceptions ?? []).filter((item) => item.company_id === company.id).map((item) => ({ id: item.id, startsAt: item.starts_at, endsAt: item.ends_at, reason: item.reason })),
  }));
}
