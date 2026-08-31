"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateLocale } from "@/lib/actions/session";
import type { Locale } from "@/types/database";
import styles from "./marketing-page.module.css";

const OPTIONS = [
  { value: "es", label: "ES" },
  { value: "pt", label: "PT" },
] as const satisfies readonly { value: Locale; label: string }[];

export function MarketingLocaleSwitcher({
  locale,
  ariaLabel,
  errorMessage,
}: {
  locale: Locale;
  ariaLabel: string;
  errorMessage: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    startTransition(async () => {
      const result = await updateLocale(nextLocale);
      if (result.error) {
        toast.error(errorMessage);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={styles.localeSwitcher} role="group" aria-label={ariaLabel}>
      {OPTIONS.map((option, index) => (
        <span className={styles.localeOption} key={option.value}>
          {index > 0 ? <span aria-hidden>/</span> : null}
          <button
            type="button"
            disabled={pending}
            aria-pressed={locale === option.value}
            onClick={() => changeLocale(option.value)}
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  );
}

