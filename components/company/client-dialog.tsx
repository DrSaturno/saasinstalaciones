"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveClient, type ClientActionState } from "@/lib/actions/clients";
import type { ClientSummary } from "@/lib/data/clients";
import { CLIENT_LIMITS } from "@/lib/domain/clients";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: ClientActionState = { error: null };

type ClientField = {
  name: string;
  label: string;
  value: string;
  required?: boolean;
  type?: "email" | "tel";
  minLength?: number;
  maxLength: number;
};

export function ClientDialog({
  client,
  trigger,
}: {
  client?: ClientSummary;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("Clients");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const action = saveClient.bind(null, client?.id ?? null);
  const [state, formAction, pending] = useActionState(
    async (previous: ClientActionState, data: FormData) => {
      const result = await action(previous, data);
      if (result.ok) {
        setOpen(false);
        toast.success(t("saved"));
        router.refresh();
      }
      return result;
    },
    initial,
  );
  // Tipo y límites salen de `CLIENT_LIMITS`, los mismos que valida el
  // servidor: el navegador frena ahí mismo, marcando el campo, lo que antes
  // volvía como un «Datos inválidos» sin saber cuál.
  const fields: ClientField[] = [
    { name: "name", label: t("name"), value: client?.name ?? "", required: true, minLength: CLIENT_LIMITS.name.min, maxLength: CLIENT_LIMITS.name.max },
    { name: "taxId", label: t("taxId"), value: client?.taxId ?? "", maxLength: CLIENT_LIMITS.taxId },
    { name: "contactName", label: t("contact"), value: client?.contactName ?? "", maxLength: CLIENT_LIMITS.contactName },
    { name: "email", label: t("email"), value: client?.email ?? "", type: "email", maxLength: CLIENT_LIMITS.email },
    { name: "phone", label: t("phone"), value: client?.phone ?? "", type: "tel", maxLength: CLIENT_LIMITS.phone },
    { name: "address", label: t("address"), value: client?.address ?? "", maxLength: CLIENT_LIMITS.address },
    { name: "website", label: t("website"), value: client?.website ?? "", maxLength: CLIENT_LIMITS.website },
    { name: "instagram", label: t("instagram"), value: client?.instagram ?? "", maxLength: CLIENT_LIMITS.social },
    { name: "youtube", label: t("youtube"), value: client?.youtube ?? "", maxLength: CLIENT_LIMITS.social },
    { name: "tiktok", label: t("tiktok"), value: client?.tiktok ?? "", maxLength: CLIENT_LIMITS.social },
  ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={client ? "outline" : "default"}>
            {client ? t("edit") : t("new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{client ? t("editTitle") : t("newTitle")}</DialogTitle></DialogHeader>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={`client-${field.name}`}>{field.label}</Label>
              <Input
                id={`client-${field.name}`}
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={field.value}
                required={field.required ?? false}
                minLength={field.minLength}
                maxLength={field.maxLength}
                disabled={pending}
              />
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-notes">{t("notes")}</Label>
            <Textarea id="client-notes" name="notes" defaultValue={client?.notes ?? ""} rows={4} maxLength={CLIENT_LIMITS.notes} disabled={pending} />
          </div>
          {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
          <Button type="submit" disabled={pending} className="sm:col-span-2">
            {pending ? t("saving") : t("save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
