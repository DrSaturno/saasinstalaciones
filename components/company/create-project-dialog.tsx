"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createProject, type ActionState } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initial: ActionState = { error: null };

export function CreateProjectDialog() {
  const t = useTranslations("CreateProject");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const next = await createProject(previous, formData);
      if (next.ok) {
      setOpen(false);
      toast.success(t("success"));
      router.refresh();
      }
      return next;
    },
    initial,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input
              id="name"
              name="name"
              placeholder={t("namePlaceholder")}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientName">{t("client")}</Label>
            <Input id="clientName" name="clientName" placeholder={t("clientPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startsAt">{t("start")}</Label>
              <Input id="startsAt" name="startsAt" type="date" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endsAt">{t("end")}</Label>
              <Input id="endsAt" name="endsAt" type="date" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">{t("projectDescription")}</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="mt-2">
            {pending ? t("creating") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
