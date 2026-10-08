"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import {
  createProjectTrackingLink,
  revokeProjectTrackingLink,
} from "@/lib/actions/project-tracking-links";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Link público de seguimiento para el cliente final (bloque 7). Visible para
 * quien opera el proyecto — gerente o el coordinador asignado —, sin
 * relación con permisos de finanzas: no es dato comercial.
 */
export function ProjectTrackingLinkPanel({
  projectId,
  activeToken,
}: {
  projectId: string;
  activeToken: string | null;
}) {
  const t = useTranslations("ProjectTrackingLink");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState(activeToken);

  const url = token ? `${window.location.origin}/seguimiento/${token}` : null;

  const generate = () => {
    if (token && !window.confirm(t("regenerateConfirm"))) return;
    startTransition(async () => {
      const res = await createProjectTrackingLink(projectId);
      if (res.error || !res.token) {
        toast.error(res.error ?? t("error"));
        return;
      }
      setToken(res.token);
      toast.success(t("generated"));
      router.refresh();
    });
  };

  const revoke = () => {
    if (!window.confirm(t("revokeConfirm"))) return;
    startTransition(async () => {
      const res = await revokeProjectTrackingLink(projectId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setToken(null);
      toast.success(t("revoked"));
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" aria-hidden="true" />
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("description")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-5">
        {url ? (
          <>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="break-all font-mono text-xs">{url}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  toast.success(t("copied"));
                }}
              >
                {t("copy")}
              </Button>
              <Button variant="outline" onClick={generate} disabled={pending}>
                {pending ? t("working") : t("regenerate")}
              </Button>
              <Button variant="ghost" onClick={revoke} disabled={pending}>
                {pending ? t("working") : t("revoke")}
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={generate} disabled={pending} className="self-start">
            {pending ? t("working") : t("generate")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
