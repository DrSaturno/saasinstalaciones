"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav } from "@/components/shared/sidebar-nav";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import type { NavItem } from "@/types/navigation";

const STORAGE_KEY = "instalapro:shell:v1";

function loadCollapsed() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    return JSON.parse(raw).collapsed === true;
  } catch {
    return false;
  }
}

export function AppShellFrame({
  area,
  nav,
  userName,
  notifications,
  accountActions,
  children,
}: {
  area: string;
  nav: NavItem[];
  userName: string;
  notifications: React.ReactNode;
  accountActions: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("Navigation");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCollapsed(loadCollapsed()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: next }));
      } catch {}
      return next;
    });
  };

  return (
    <div className="flex min-h-svh bg-background">
      {mobileOpen ? (
        <button
          type="button"
          aria-label={t("closeNavigation")}
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r bg-card transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-svh lg:translate-x-0",
          collapsed && "lg:w-[72px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary font-mono text-xs font-semibold text-primary-foreground">
            IP
          </div>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate font-mono text-sm font-semibold">Instala Pro</p>
            <p className="truncate text-xs text-muted-foreground">{area}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden"
            aria-label={t("closeMenu")}
          >
            <X />
          </Button>
        </div>

        <SidebarNav
          items={nav}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />

        <div className="border-t p-3">
          <div className={cn("rounded-xl bg-muted/60 p-3", collapsed && "lg:p-2")}>
            <div className={cn("flex items-center gap-3", collapsed && "lg:justify-center")}>
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft font-mono text-xs font-semibold text-primary">
                {userName.trim().charAt(0).toUpperCase() || "U"}
              </div>
              <p className={cn("min-w-0 truncate text-xs font-medium", collapsed && "lg:hidden")}>
                {userName}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="mt-2 hidden w-full justify-center lg:flex"
            aria-label={collapsed ? t("expandMenu") : t("collapseMenu")}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
            <span className={cn("text-xs", collapsed && "sr-only")}>{t("collapse")}</span>
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden"
              aria-label={t("openMenu")}
            >
              <Menu />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{area}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">{t("operationalCenter")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {notifications}
            {accountActions}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
