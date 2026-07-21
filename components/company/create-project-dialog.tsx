"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createProject, type ActionState } from "@/lib/actions/projects";
import { ProjectFormFields } from "@/components/company/project-form-fields";
import { Button } from "@/components/ui/button";
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
      <DialogTrigger asChild><Button>{t("trigger")}</Button></DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-5">
          <ProjectFormFields pending={pending} />
          {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? t("creating") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
