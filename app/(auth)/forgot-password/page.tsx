import Link from "next/link";
import { useTranslations } from "next-intl";
import { ForgotPasswordForm } from "./forgot-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const t = useTranslations("ForgotPassword");
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
            <CardTitle className="text-xl">{t("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
