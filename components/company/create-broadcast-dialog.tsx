"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createBroadcast,
  type BroadcastActionState,
} from "@/lib/actions/broadcasts";
import type { ProjectOption } from "@/lib/data/broadcasts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL: BroadcastActionState = { error: null };

export function CreateBroadcastDialog({
  projects,
  zones,
}: {
  projects: ProjectOption[];
  zones: string[];
}) {
  const t = useTranslations("CreateBroadcast");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (previous: BroadcastActionState, formData: FormData) => {
      const next = await createBroadcast(previous, formData);
      if (next.ok) {
        setOpen(false);
        toast.success(t("published"));
        router.refresh();
      }
      return next;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!projects.length}>
          <Plus /> {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="broadcast-project">{t("project")}</Label>
            <select
              id="broadcast-project"
              name="projectId"
              required
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="" disabled>{t("chooseProject")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-zone">{t("zone")}</Label>
            <Input
              id="broadcast-zone"
              name="zone"
              list="company-zones"
              placeholder="AR-CBA"
              autoCapitalize="characters"
              required
            />
            <datalist id="company-zones">
              {zones.map((zone) => <option key={zone} value={zone} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="broadcast-title">{t("searchTitle")}</Label>
              <Input id="broadcast-title" name="title" maxLength={120} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-slots">{t("slots")}</Label>
              <Input id="broadcast-slots" name="slots" type="number" min={1} max={50} defaultValue={1} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="broadcast-description">{t("detail")}</Label>
            <Textarea id="broadcast-description" name="description" maxLength={1200} rows={4} placeholder={t("detailPlaceholder")} />
          </div>
          {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? t("publishing") : t("submit")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
