import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  const t = useTranslations("Landing");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <Badge variant="secondary" className="bg-accent text-accent-foreground">
        {t("privateBeta")}
      </Badge>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        {t("title")}
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        {t("description")}
      </p>
      <div className="flex items-center gap-3">
        <Button asChild size="lg">
          <Link href="/login">{t("login")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="mailto:ventas@instalapro.com">{t("contactSales")}</a>
        </Button>
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {t("regionalCaption")}
      </p>
    </main>
  );
}
