"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CreateResult = {
  company: { id: string; name: string };
  managerEmail: string;
  invitation:
    | { status: "sent" }
    | { status: "manual"; activationUrl: string };
};

export function CreateCompanyDialog() {
  const t = useTranslations("CreateCompany");
  const common = useTranslations("Common");
  const errors = useTranslations("Errors");
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<"AR" | "BR">("AR");
  const [created, setCreated] = useState<CreateResult | null>(null);
  const queryClient = useQueryClient();

  const createCompany = useMutation({
    mutationFn: async (formData: FormData) => {
      const payload = {
        name: String(formData.get("name") ?? ""),
        country,
        orderPrefix: String(formData.get("orderPrefix") ?? "ORD").toUpperCase(),
        managerEmail: String(formData.get("managerEmail") ?? ""),
        managerName: String(formData.get("managerName") ?? ""),
      };
      const res = await fetch("/api/master/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? errors("createCompany"));
      return body as CreateResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["master"] });
      setCreated(result);
      toast.success(t("createdToast", { name: result.company.name }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = () => {
    setOpen(false);
    setCreated(null);
    setCountry("AR");
    createCompany.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button>{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("createdTitle")}</DialogTitle>
              <DialogDescription>
                {t(
                  created.invitation.status === "sent"
                    ? "createdDescriptionSent"
                    : "createdDescriptionManual",
                  { email: created.managerEmail },
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">{common("email")}</p>
              <p className="font-mono text-sm">{created.managerEmail}</p>
              {created.invitation.status === "manual" ? (
                <>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("activationLink")}
                  </p>
                  <p className="break-all font-mono text-xs">
                    {created.invitation.activationUrl}
                  </p>
                  <p className="mt-3 text-xs text-amber-700">
                    {t("manualLinkWarning")}
                  </p>
                </>
              ) : null}
            </div>
            {created.invitation.status === "manual" ? (
              <Button
                variant="outline"
                onClick={() => {
                  const activationUrl = created.invitation.status === "manual" ? created.invitation.activationUrl : null;
                  if (!activationUrl) return;
                  navigator.clipboard.writeText(activationUrl);
                  toast.success(t("linkCopied"));
                }}
              >
                {t("copyActivationLink")}
              </Button>
            ) : null}
            <Button onClick={close}>{common("done")}</Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {t("description")}
              </DialogDescription>
            </DialogHeader>
            <form
              action={(formData) => createCompany.mutate(formData)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("businessName")}</Label>
                <Input id="name" name="name" placeholder="Alltak Brasil Ltda." required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="country">{t("country")}</Label>
                  <Select
                    value={country}
                    onValueChange={(v) => setCountry(v as "AR" | "BR")}
                  >
                    <SelectTrigger id="country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AR">Argentina</SelectItem>
                      <SelectItem value="BR">Brasil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="orderPrefix">{t("orderPrefix")}</Label>
                  <Input
                    id="orderPrefix"
                    name="orderPrefix"
                    placeholder="ALL"
                    defaultValue="ORD"
                    maxLength={5}
                    className="font-mono uppercase"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="managerName">{t("manager")}</Label>
                <Input id="managerName" name="managerName" placeholder={t("managerPlaceholder")} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="managerEmail">{t("managerEmail")}</Label>
                <Input
                  id="managerEmail"
                  name="managerEmail"
                  type="email"
                  placeholder="responsable@empresa.com"
                  required
                />
              </div>
              <Button type="submit" disabled={createCompany.isPending} className="mt-2">
                {createCompany.isPending ? t("creating") : t("submit")}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
