"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveClient, type ClientActionState } from "@/lib/actions/clients";
import type { ClientSummary } from "@/lib/data/clients";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: ClientActionState = { error: null };

export function ClientDialog({ client }: { client?: ClientSummary }) {
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
  const fields = [
    ["name", t("name"), client?.name ?? "", true],
    ["taxId", t("taxId"), client?.taxId ?? "", false],
    ["contactName", t("contact"), client?.contactName ?? "", false],
    ["email", t("email"), client?.email ?? "", false],
    ["phone", t("phone"), client?.phone ?? "", false],
    ["address", t("address"), client?.address ?? "", false],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={client ? "outline" : "default"}>
          {client ? t("edit") : t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{client ? t("editTitle") : t("newTitle")}</DialogTitle></DialogHeader>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {fields.map(([name, label, value, required]) => (
            <div key={name} className="flex flex-col gap-2">
              <Label htmlFor={`client-${name}`}>{label}</Label>
              <Input id={`client-${name}`} name={name} defaultValue={value} required={required} disabled={pending} />
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-notes">{t("notes")}</Label>
            <Textarea id="client-notes" name="notes" defaultValue={client?.notes ?? ""} rows={4} disabled={pending} />
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
