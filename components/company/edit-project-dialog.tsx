"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateProject, type ActionState } from "@/lib/actions/projects";
import { ProjectFormFields } from "@/components/company/project-form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ProjectFormDefaults } from "@/lib/domain/projects";

const initial: ActionState = { error: null };

export function EditProjectDialog({ projectId, defaults }: { projectId: string; defaults: ProjectFormDefaults }) {
  const t = useTranslations("CreateProject");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const action = updateProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.ok) {
        setOpen(false);
        toast.success(t("updated"));
        router.refresh();
      }
      return next;
    },
    initial,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">{t("edit")}</Button></DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("editTitle")}</DialogTitle><DialogDescription>{t("editDescription")}</DialogDescription></DialogHeader>
        <form action={formAction} className="flex flex-col gap-5">
          <ProjectFormFields defaults={defaults} pending={pending} />
          {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? t("saving") : t("save")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
