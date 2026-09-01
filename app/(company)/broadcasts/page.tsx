import Link from "next/link";
import { RadioTower } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CreateBroadcastDialog } from "@/components/company/create-broadcast-dialog";
import { BroadcastCard } from "@/components/company/broadcast-card";
import { createClient } from "@/lib/supabase/server";
import { fetchBroadcastBoard } from "@/lib/data/broadcasts";
import { getCurrentUser } from "@/lib/auth";

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const [t, { filter }] = await Promise.all([
    getTranslations("Broadcasts"),
    searchParams,
  ]);
  const supabase = await createClient();
  const [board, user] = await Promise.all([
    fetchBroadcastBoard(supabase),
    getCurrentUser(),
  ]);
  const openCount = board.broadcasts.filter((item) => item.status === "open").length;
  const pendingCount = board.broadcasts.reduce(
    (total, item) =>
      total + item.applicants.filter((applicant) => applicant.status === "applied").length,
    0,
  );

  // Los accesos rápidos del inicio entran acá ya filtrados.
  const visible =
    filter === "open"
      ? board.broadcasts.filter((item) => item.status === "open")
      : filter === "applications"
        ? board.broadcasts.filter((item) =>
            item.applicants.some((applicant) => applicant.status === "applied"),
          )
        : board.broadcasts;

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <div className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <CreateBroadcastDialog projects={board.projects} clients={board.clients} zones={board.zones} canManageFinance={user?.role === "company_manager"} />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:w-fit sm:grid-cols-[160px_160px]">
        <div className="bg-card p-4">
          <p className="font-mono text-2xl font-semibold">{openCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("openSearches")}</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-2xl font-semibold">{pendingCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("toReview")}</p>
        </div>
      </div>

      {filter ? (
        <div className="mt-6 flex items-center gap-3">
          <span className="rounded-full bg-primary-soft/60 px-3 py-1 text-xs font-medium text-primary">
            {filter === "open" ? t("filterOpen") : t("filterApplications")}
          </span>
          <Link href="/broadcasts" className="text-xs text-muted-foreground hover:text-foreground">
            {t("clearFilter")}
          </Link>
        </div>
      ) : null}

      {visible.length ? (
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
          {visible.map((broadcast) => (
            <BroadcastCard key={broadcast.id} broadcast={broadcast} coordinators={board.coordinators} />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 text-center">
          <span className="mb-4 rounded-full bg-accent p-3 text-primary">
            <RadioTower className="size-5" />
          </span>
          <h2 className="font-medium">{t("emptyTitle")}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
      )}
    </div>
  );
}
