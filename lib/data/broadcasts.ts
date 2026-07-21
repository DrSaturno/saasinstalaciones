import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import type {
  ApplicationStatus,
  BroadcastStatus,
  Database,
} from "@/types/database";

export type ProjectOption = { id: string; name: string };

export type BroadcastApplicant = {
  installerId: string;
  name: string;
  status: ApplicationStatus;
  message: string | null;
  createdAt: string;
  zones: string[];
  ratingAvg: number;
  ratingCount: number;
};

export type BroadcastOrderOption = {
  id: string;
  orderNumber: string;
  title: string;
  siteName: string;
};

export type ManagerBroadcast = {
  id: string;
  projectId: string | null;
  projectName: string;
  zone: string;
  title: string;
  description: string;
  slots: number;
  status: BroadcastStatus;
  createdAt: string;
  acceptedCount: number;
  applicants: BroadcastApplicant[];
  availableOrders: BroadcastOrderOption[];
};

export type BroadcastBoard = {
  broadcasts: ManagerBroadcast[];
  projects: ProjectOption[];
  zones: string[];
};

export type InstallerJob = {
  id: string;
  zone: string;
  title: string;
  description: string;
  slots: number;
  status: BroadcastStatus;
  createdAt: string;
  applicationStatus: ApplicationStatus | null;
  applicationMessage: string | null;
};

export type InstallerJobsBoard = {
  jobs: InstallerJob[];
  zones: string[];
  available: boolean;
};

export async function fetchBroadcastBoard(
  supabase: SupabaseClient<Database>,
): Promise<BroadcastBoard> {
  const t = await getTranslations("DataFallbacks");
  const [{ data: broadcasts }, { data: projects }, { data: sites }] =
    await Promise.all([
      supabase
        .from("broadcasts")
        .select("id, project_id, zone, title, description, slots, status, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("id, name")
        .in("status", ["draft", "active", "paused"])
        .order("name"),
      supabase.from("sites").select("zone").neq("zone", ""),
    ]);

  const broadcastRows = broadcasts ?? [];
  const broadcastIds = broadcastRows.map((broadcast) => broadcast.id);
  const projectIds = [
    ...new Set(
      broadcastRows
        .map((broadcast) => broadcast.project_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const applicationQuery = broadcastIds.length
    ? supabase
        .from("broadcast_applications")
        .select("broadcast_id, installer_id, status, message, created_at")
        .in("broadcast_id", broadcastIds)
        .order("created_at")
    : Promise.resolve({ data: [] });
  const orderQuery = projectIds.length
    ? supabase
        .from("work_orders")
        .select("id, project_id, order_number, title, site_id")
        .in("project_id", projectIds)
        .is("assigned_installer_id", null)
        .not("status", "in", "(finalizada,cancelada)")
        .order("order_number")
    : Promise.resolve({ data: [] });

  const [{ data: applications }, { data: orders }] = await Promise.all([
    applicationQuery,
    orderQuery,
  ]);
  const installerIds = [
    ...new Set((applications ?? []).map((application) => application.installer_id)),
  ];
  const siteIds = [...new Set((orders ?? []).map((order) => order.site_id))];

  const profileQuery = installerIds.length
    ? supabase.from("profiles").select("id, full_name").in("id", installerIds)
    : Promise.resolve({ data: [] });
  const installerQuery = installerIds.length
    ? supabase
        .from("installers")
        .select("id, zones, rating_avg, rating_count")
        .in("id", installerIds)
    : Promise.resolve({ data: [] });
  const orderSiteQuery = siteIds.length
    ? supabase.from("sites").select("id, name").in("id", siteIds)
    : Promise.resolve({ data: [] });

  const [{ data: profiles }, { data: installers }, { data: orderSites }] =
    await Promise.all([profileQuery, installerQuery, orderSiteQuery]);

  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const installerById = new Map((installers ?? []).map((i) => [i.id, i]));
  const siteNameById = new Map((orderSites ?? []).map((site) => [site.id, site.name]));

  return {
    projects: projects ?? [],
    zones: [
      ...new Set(
        (sites ?? [])
          .map((site) => site.zone.trim())
          .filter(Boolean)
          .map((zone) => zone.toUpperCase()),
      ),
    ].sort(),
    broadcasts: broadcastRows.map((broadcast) => {
      const ownApplications = (applications ?? []).filter(
        (application) => application.broadcast_id === broadcast.id,
      );
      return {
        id: broadcast.id,
        projectId: broadcast.project_id,
        projectName: broadcast.project_id
          ? (projectNameById.get(broadcast.project_id) ?? t("project"))
          : t("noProject"),
        zone: broadcast.zone,
        title: broadcast.title,
        description: broadcast.description,
        slots: broadcast.slots,
        status: broadcast.status,
        createdAt: broadcast.created_at,
        acceptedCount: ownApplications.filter(
          (application) => application.status === "accepted",
        ).length,
        applicants: ownApplications.map((application) => {
          const installer = installerById.get(application.installer_id);
          return {
            installerId: application.installer_id,
            name: nameById.get(application.installer_id) ?? t("installer"),
            status: application.status,
            message: application.message,
            createdAt: application.created_at,
            zones: installer?.zones ?? [],
            ratingAvg: installer?.rating_avg ?? 0,
            ratingCount: installer?.rating_count ?? 0,
          };
        }),
        availableOrders: (orders ?? [])
          .filter((order) => order.project_id === broadcast.project_id)
          .map((order) => ({
            id: order.id,
            orderNumber: order.order_number,
            title: order.title,
            siteName: siteNameById.get(order.site_id) ?? t("site"),
          })),
      };
    }),
  };
}

export async function fetchInstallerJobs(
  supabase: SupabaseClient<Database>,
): Promise<InstallerJobsBoard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { jobs: [], zones: [], available: false };

  const [{ data: broadcasts }, { data: applications }, { data: installer }] =
    await Promise.all([
      supabase
        .from("broadcasts")
        .select("id, zone, title, description, slots, status, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("broadcast_applications")
        .select("broadcast_id, status, message")
        .eq("installer_id", user.id),
      supabase
        .from("installers")
        .select("zones, available")
        .eq("id", user.id)
        .single(),
    ]);

  const applicationByBroadcast = new Map(
    (applications ?? []).map((application) => [application.broadcast_id, application]),
  );

  return {
    zones: installer?.zones ?? [],
    available: installer?.available ?? false,
    jobs: (broadcasts ?? []).map((broadcast) => {
      const application = applicationByBroadcast.get(broadcast.id);
      return {
        id: broadcast.id,
        zone: broadcast.zone,
        title: broadcast.title,
        description: broadcast.description,
        slots: broadcast.slots,
        status: broadcast.status,
        createdAt: broadcast.created_at,
        applicationStatus: application?.status ?? null,
        applicationMessage: application?.message ?? null,
      };
    }),
  };
}
