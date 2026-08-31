import Link from "next/link";
import type { Locale } from "@/types/database";
import { BrandMark } from "./brand-mark";
import { MarketingLocaleSwitcher } from "./marketing-locale-switcher";
import styles from "./marketing-page.module.css";

export function MarketingHeader({
  brand,
  locale,
  localeAriaLabel,
  localeError,
  login,
  contactSales,
  contactHref,
  navigationLabel,
}: {
  brand: string;
  locale: Locale;
  localeAriaLabel: string;
  localeError: string;
  login: string;
  contactSales: string;
  contactHref: string;
  navigationLabel: string;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <BrandMark label={brand} />
        <nav className={styles.headerNav} aria-label={navigationLabel}>
          <MarketingLocaleSwitcher
            locale={locale}
            ariaLabel={localeAriaLabel}
            errorMessage={localeError}
          />
          <Link className={styles.headerLogin} href="/login">
            {login}
          </Link>
          <a className={styles.headerCta} href={contactHref}>
            {contactSales}
          </a>
        </nav>
      </div>
    </header>
  );
}

