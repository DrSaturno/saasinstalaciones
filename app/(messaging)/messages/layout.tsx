import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/shared/app-shell";

export default async function MessagingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Navigation");
  const companyNav = [
    { href: "/dashboard", label: t("home"), icon: "dashboard" as const },
    { href: "/projects", label: t("projects"), icon: "projects" as const },
    { href: "/orders", label: t("orders"), icon: "orders" as const },
    { href: "/clients", label: t("clients"), icon: "clients" as const },
    { href: "/team", label: t("team"), icon: "team" as const },
    { href: "/broadcasts", label: t("broadcasts"), icon: "broadcasts" as const },
    { href: "/messages", label: t("messages"), icon: "messages" as const },
    ...(user.role === "company_manager" ? [{ href: "/finance", label: t("finance"), icon: "finance" as const }] : []),
  ];
  const installerNav = [
    { href: "/tasks", label: t("tasks"), icon: "tasks" as const },
    { href: "/jobs", label: t("jobs"), icon: "jobs" as const },
    { href: "/messages", label: t("messages"), icon: "messages" as const },
    { href: "/profile", label: t("profile"), icon: "profile" as const },
  ];
  if (!["company_manager", "coordinator", "installer"].includes(user.role)) redirect("/");
  return <AppShell area={user.role === "installer" ? t("installerArea") : t("companyArea")} nav={user.role === "installer" ? installerNav : companyNav} userName={user.fullName} locale={user.locale} showNotifications>{children}</AppShell>;
}
