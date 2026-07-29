import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "./reset-password-form";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [t, searchParams, supabase] = await Promise.all([
    getTranslations("ResetPassword"),
    props.searchParams,
    createClient(),
  ]);

  // El link del email abre una sesión de recuperación antes de llegar acá. Sin
  // ella no hay nada que acredite quién es: puede haber vencido, ya haberse
  // usado, o —con PKCE— haberse abierto en otro navegador distinto al que lo
  // pidió. En los tres casos la salida es la misma: pedir uno nuevo.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const invalid = Boolean(searchParams.error) || !user;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="font-mono text-sm text-muted-foreground">
            Instala Pro
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {invalid ? t("invalidLink") : t("title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invalid ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {t("invalidLinkDescription")}
                </p>
                <Button asChild size="lg">
                  <Link href="/forgot-password">{t("requestNew")}</Link>
                </Button>
              </div>
            ) : (
              <ResetPasswordForm />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
