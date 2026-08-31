import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { getMessages, getTranslations } from "next-intl/server";
import {
  Building2,
  CloudOff,
  Languages,
  LayoutDashboard,
  ShieldCheck,
  Smartphone,
  Star,
  UploadCloud,
} from "lucide-react";
import { BrandMark } from "@/components/marketing/brand-mark";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { OperationsShowcase } from "@/components/marketing/operations-showcase";
import { RouteConstellation } from "@/components/marketing/route-constellation";
import styles from "@/components/marketing/marketing-page.module.css";
import {
  DEFAULT_PROFILE_LOCALE,
  isProfileLocale,
  LOCALE_COOKIE,
} from "@/i18n/config";
import marketingMessageShape from "@/messages/marketing/es.json";

type MarketingMessages = typeof marketingMessageShape;

const SALES_HREF = "mailto:ventas@seinstala.com.ar";

const PILLARS = [
  { key: "Company", icon: Building2, tone: "blue" },
  { key: "Installer", icon: Smartphone, tone: "lavender" },
  { key: "Control", icon: LayoutDashboard, tone: "sand" },
] as const;

const FEATURES = [
  { key: "States", icon: ShieldCheck },
  { key: "Offline", icon: CloudOff },
  { key: "Multitenant", icon: Building2 },
  { key: "Bulk", icon: UploadCloud },
  { key: "Ratings", icon: Star },
  { key: "I18n", icon: Languages },
] as const;

const PILLAR_TONES = {
  blue: styles.pillarBlue,
  lavender: styles.pillarLavender,
  sand: styles.pillarSand,
};

export default async function LandingPage() {
  const [t, common, localeSwitcher, cookieStore, messages] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("Common"),
    getTranslations("LocaleSwitcher"),
    cookies(),
    getMessages(),
  ]);
  const marketing = messages.Landing as typeof messages.Landing &
    MarketingMessages;
  const storedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isProfileLocale(storedLocale)
    ? storedLocale
    : DEFAULT_PROFILE_LOCALE;

  return (
    <div className={styles.page}>
      <MarketingHeader
        brand={common("brand")}
        locale={locale}
        localeAriaLabel={localeSwitcher("ariaLabel")}
        localeError={localeSwitcher("error")}
        login={t("login")}
        contactSales={t("contactSales")}
        contactHref={SALES_HREF}
        navigationLabel={marketing.navigationLabel}
      />

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.betaBadge}>{t("privateBeta")}</span>
            <h1 id="hero-title" className={styles.heroTitle}>
              {t("title")}
            </h1>
            <p className={styles.heroDescription}>{t("description")}</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryCta} href={SALES_HREF}>
                {t("contactSales")}
              </a>
              <Link className={styles.secondaryCta} href="/login">
                {t("login")}
              </Link>
            </div>
            <p className={styles.regionalCaption}>{t("regionalCaption")}</p>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.heroGlow} aria-hidden />
            <Image
              className={styles.heroImage}
              src="/images/landing-hero.png"
              alt={marketing.heroImageAlt}
              width={1679}
              height={944}
              priority
              sizes="(max-width: 760px) 100vw, (max-width: 1200px) 58vw, 720px"
            />
          </div>
        </section>

        <section className={styles.audience} aria-labelledby="audience-title">
          <h2 id="audience-title">{t("audienceTitle")}</h2>
          <p>{marketing.audienceSummary}</p>
        </section>

        <section className={styles.section} aria-labelledby="pillars-title">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionEyebrow}>
              {marketing.pillarsEyebrow}
            </span>
            <h2 id="pillars-title">{t("pillarsTitle")}</h2>
          </div>

          <div className={styles.pillarsGrid}>
            {PILLARS.map(({ key, icon: Icon, tone }) => (
              <article
                className={`${styles.pillarCard} ${PILLAR_TONES[tone]}`}
                key={key}
              >
                <span className={styles.pillarIcon} aria-hidden>
                  <Icon />
                </span>
                <h3>{t(`pillar${key}Title`)}</h3>
                <p>{t(`pillar${key}Body`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.showcaseSection}>
          <OperationsShowcase
            title={marketing.showcaseTitle}
            states={marketing.showcaseStates}
            evidence={marketing.showcaseEvidence}
            location={marketing.showcaseLocation}
          />
        </section>

        <section className={styles.section} aria-labelledby="features-title">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionEyebrow}>
              {marketing.featuresEyebrow}
            </span>
            <h2 id="features-title">{t("featuresTitle")}</h2>
          </div>

          <div className={styles.featuresGrid}>
            {FEATURES.map(({ key, icon: Icon }) => (
              <article className={styles.feature} key={key}>
                <span className={styles.featureIcon} aria-hidden>
                  <Icon />
                </span>
                <div>
                  <h3>{t(`feature${key}Title`)}</h3>
                  <p>{t(`feature${key}Body`)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          id="contacto"
          className={styles.finalCta}
          aria-labelledby="cta-title"
        >
          <div className={styles.ctaCopy}>
            <h2 id="cta-title">{t("ctaTitle")}</h2>
            <p>{t("ctaBody")}</p>
            <a className={styles.primaryCta} href={SALES_HREF}>
              {t("contactSales")}
            </a>
          </div>
          <RouteConstellation />
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <BrandMark label={common("brand")} compact />
          <p>{t("footerRights")}</p>
          <p className={styles.footerRegion}>{t("footerRegion")}</p>
        </div>
      </footer>
    </div>
  );
}
