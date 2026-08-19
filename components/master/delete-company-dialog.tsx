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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Baja irreversible de una empresa: se lleva el proyecto, los puntos, las
 * órdenes y la cuenta de su gerente. Por eso pide escribir el nombre exacto en
 * vez de un simple sí/no — es el mismo patrón que un botón así merece cuando
 * además borra el acceso de una persona, no sólo datos.
 */
export function DeleteCompanyDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("DeleteCompany");
  const errors = useTranslations("Errors");
  const common = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const queryClient = useQueryClient();

  const deleteCompany = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/master/companies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? errors("deleteCompany"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master"] });
      toast.success(t("deletedToast", { name }));
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = () => {
    setOpen(false);
    setConfirmText("");
    deleteCompany.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-name">{t("confirmLabel", { name })}</Label>
          <Input
            id="confirm-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {common("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={confirmText !== name || deleteCompany.isPending}
            onClick={() => deleteCompany.mutate()}
          >
            {deleteCompany.isPending ? t("deleting") : t("confirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
