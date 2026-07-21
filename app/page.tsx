import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  Boxes,
  CloudOff,
  ShieldCheck,
  UploadCloud,
  Star,
  Languages,
  Building2,
  Smartphone,
  LayoutDashboard,
} from "lucide-react";
import { DEFAULT_PROFILE_LOCALE, isProfileLocale, LOCALE_COOKIE } from "@/i18n/config";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const PILLARS = [
  { key: "Company", icon: Building2 },
  { key: "Installer", icon: Smartphone },
  { key: "Control", icon: LayoutDashboard },
] as const;

const FEATURES = [
  { key: "States", icon: ShieldCheck },
  { key: "Offline", icon: CloudOff },
  { key: "Multitenant", icon: Boxes },
  { key: "Bulk", icon: UploadCloud },
  { key: "Ratings", icon: Star },
  { key: "I18n", icon: Languages },
] as const;

export default async function LandingPage() {
  const t = await getTranslations("Landing");
  const cookieStore = await cookies();
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isProfileLocale(stored) ? stored : DEFAULT_PROFILE_LOCALE;

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="font-mono text-sm font-medium">Instala Pro</span>
          <div className="flex items-center gap-2">
            <LocaleSwitcher locale={locale} />
            <Button asChild size="sm">
              <Link href="/login">{t("login")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center sm:pt-28">
          <Badge
            variant="secondary"
            className="bg-accent text-accent-foreground"
          >
            {t("privateBeta")}
          </Badge>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted-foreground">
            {t("description")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a href="mailto:ventas@instalapro.com">{t("contactSales")}</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">{t("login")}</Link>
            </Button>
          </div>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            {t("regionalCaption")}
          </p>
        </section>

        {/* Para quién */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("audienceTitle")}
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              {t("audienceBody")}
            </p>
          </div>
        </section>

        {/* Tres pilares */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            {t("pillarsTitle")}
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PILLARS.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <CardContent className="pt-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{t(`pillar${key}Title`)}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t(`pillar${key}Body`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              {t("featuresTitle")}
            </h2>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon }) => (
                <div key={key} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-medium">{t(`feature${key}Title`)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`feature${key}Body`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-2xl border bg-primary-soft/40 px-6 py-12 text-center">
            <h2 className="mx-auto max-w-xl text-balance text-2xl font-bold tracking-tight sm:text-3xl">
              {t("ctaTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              {t("ctaBody")}
            </p>
            <Button asChild size="lg" className="mt-7">
              <a href="mailto:ventas@instalapro.com">{t("contactSales")}</a>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-center text-sm text-muted-foreground sm:flex-row sm:text-left">
          <span>{t("footerRights")}</span>
          <span className="font-mono text-xs">{t("footerRegion")}</span>
        </div>
      </footer>
    </div>
  );
}
