import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/lib/actions/session";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { AppShellFrame } from "@/components/shared/app-shell-frame";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/types/database";
import type { NavItem } from "@/types/navigation";

export async function AppShell({
  area,
  nav,
  userName,
  locale,
  showNotifications = false,
  children,
}: {
  area: string;
  nav: NavItem[];
  userName: string;
  locale: Locale;
  showNotifications?: boolean;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Navigation");

  const notifications = showNotifications ? (
    <Suspense fallback={<span className="size-9" />}>
      <NotificationBell />
    </Suspense>
  ) : null;

  const accountActions = (
    <>
      <LocaleSwitcher locale={locale} />
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm">
          {t("logout")}
        </Button>
      </form>
    </>
  );

  return (
    <AppShellFrame
      area={area}
      nav={nav}
      userName={userName}
      notifications={notifications}
      accountActions={accountActions}
    >
      {children}
    </AppShellFrame>
  );
}
