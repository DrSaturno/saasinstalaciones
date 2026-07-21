"use client";

import { useTransition } from "react";
import { Check, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateLocale } from "@/lib/actions/session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/types/database";

const OPTIONS: { value: Locale; key: "spanish" | "portuguese" }[] = [
  { value: "es", key: "spanish" },
  { value: "pt", key: "portuguese" },
];

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const t = useTranslations("LocaleSwitcher");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    startTransition(async () => {
      const result = await updateLocale(nextLocale);
      if (result.error) {
        toast.error(t("error"));
        return;
      }
      toast.success(t("updated"));
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={t("ariaLabel")}
          className="gap-1.5 px-2"
        >
          <Languages />
          <span className="hidden font-mono text-xs uppercase sm:inline">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => changeLocale(option.value)}
            className="justify-between gap-4"
          >
            {t(option.key)}
            {locale === option.value ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
