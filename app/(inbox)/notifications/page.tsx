import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchNotificationPage } from "@/lib/data/notifications";
import {
  NOTIFICATION_FILTERS,
  parseNotificationFilter,
} from "@/lib/domain/notifications";
import { NotificationInboxList } from "@/components/notifications/notification-inbox-list";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const [t, supabase, query] = await Promise.all([
    getTranslations("Notifications"),
    createClient(),
    searchParams,
  ]);
  // El filtro vive en la URL y no en estado de cliente: así el enlace es
  // compartible y sobrevive a la recarga.
  const filter = parseNotificationFilter(query.filter);
  const { items, hasMore } = await fetchNotificationPage(supabase, filter);

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

      {hasMore ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">{t("moreAvailable")}</p>
      ) : null}
    </div>
  );
}
