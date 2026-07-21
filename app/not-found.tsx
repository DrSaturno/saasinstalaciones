import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("AppStates");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="font-mono text-5xl font-medium text-primary">404</p>
      <h1 className="text-2xl font-bold tracking-tight">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("notFoundBody")}</p>
      <Button asChild className="mt-2">
        <Link href="/">{t("notFoundHome")}</Link>
      </Button>
    </main>
  );
}
