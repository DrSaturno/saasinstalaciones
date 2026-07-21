import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_PROFILE_LOCALE,
  INTL_LOCALE,
  isProfileLocale,
  LOCALE_COOKIE,
  LOCALE_TIME_ZONE,
} from "@/i18n/config";

const messageLoaders = {
  es: () => import("@/messages/es.json").then((module) => module.default),
  pt: () => import("@/messages/pt.json").then((module) => module.default),
};

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const storedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const profileLocale = isProfileLocale(storedLocale)
    ? storedLocale
    : DEFAULT_PROFILE_LOCALE;

  return {
    locale: INTL_LOCALE[profileLocale],
    messages: await messageLoaders[profileLocale](),
    timeZone: LOCALE_TIME_ZONE[profileLocale],
  };
});
