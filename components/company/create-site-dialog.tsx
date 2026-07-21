"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createSite, type SiteActionState } from "@/lib/actions/sites";
import { SiteFormFields } from "@/components/company/site-form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Country } from "@/types/database";

const initial: SiteActionState = { error: null };

export function CreateSiteDialog({ projectId, country, zones }: { projectId: string; country: Country; zones: string[] }) {
  const t = useTranslations("SiteForm");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = createSite.bind(null, projectId);
  const [state, formAction, pending] = useActionState(async (previous: SiteActionState, formData: FormData) => {
    const next = await action(previous, formData);
    if (next.ok) { setOpen(false); toast.success(t("created")); router.refresh(); }
    return next;
  }, initial);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">{t("add")}</Button></DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{t("createTitle")}</DialogTitle><DialogDescription>{t("createDescription")}</DialogDescription></DialogHeader>
        <form action={formAction} className="space-y-5"><SiteFormFields country={country} zones={zones} pending={pending} />{state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}<Button type="submit" disabled={pending} className="w-full">{pending ? t("saving") : t("create")}</Button></form>
      </DialogContent>
    </Dialog>
  );
}
