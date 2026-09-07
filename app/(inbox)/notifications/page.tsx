import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchNotificationPage } from "@/lib/data/notifications";
import {
  NOTIFICATION_FILTERS,
  parseNotificationFilter,
} from "@/lib/domain/notifications";
import { NotificationInboxList } from "@/components/notifications/notification-inbox-list";
import { Pagination } from "@/components/shared/pagination";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const [t, supabase, query] = await Promise.all([
    getTranslations("Notifications"),
    createClient(),
    searchParams,
  ]);
  // El filtro vive en la URL y no en estado de cliente: así el enlace es
  // compartible y sobrevive a la recarga.
  const filter = parseNotificationFilter(query.filter);
  // La página también vive en la URL, por el mismo motivo que el filtro. Se
  // sanea acá: un `?page=-3` o `?page=abc` no puede llegar al `.range()`.
  const parsedPage = Number.parseInt(query.page ?? "0", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 0;
  const { items, hasMore } = await fetchNotificationPage(supabase, filter, page);

  // Saltar de página no puede perder el filtro activo.
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (filter !== "pending") params.set("filter", filter);
    if (target > 0) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/notifications?${qs}` : "/notifications";
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("inboxTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("inboxDescription")}</p>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label={t("inboxFilters")}>
        {NOTIFICATION_FILTERS.map((option) => (
          <Link
            key={option}
            href={option === "pending" ? "/notifications" : `/notifications?filter=${option}`}
            aria-current={filter === option ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === option
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary/40"
            }`}
          >
            {t(`filters.${option}`)}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        <NotificationInboxList items={items} filter={filter} />
      </div>

      <Pagination
        className="mt-4"
        page={page}
        hasMore={hasMore}
        buildHref={hrefForPage}
        labels={{
          previous: t("previousPage"),
          next: t("nextPage"),
          current: t("pageNumber", { page: page + 1 }),
        }}
      />
    </div>
  );
}
