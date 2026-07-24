"use client";

import { useState, useTransition } from "react";
import { CalendarDays, CircleDollarSign, MapPin, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { applyToBroadcast } from "@/lib/actions/broadcasts";
import type { InstallerJob } from "@/lib/data/broadcasts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS = {
  applied: { className: "bg-lavender text-foreground" },
  accepted: { className: "bg-success/15 text-success" },
  rejected: { className: "bg-muted text-muted-foreground" },
} as const;

export function JobCard({ job }: { job: InstallerJob }) {
  const t = useTranslations("JobCard");
  const statusT = useTranslations("Status");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const application = job.applicationStatus ? STATUS[job.applicationStatus] : null;

  const submit = () => startTransition(async () => {
    const result = await applyToBroadcast(job.id, message);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(t("sent"));
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <Card className={job.status === "closed" ? "opacity-70" : ""}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono text-xs text-primary"><MapPin className="size-3" />{job.zone}</span>
            {application && job.applicationStatus ? (
              <Badge className={application.className}>
                {statusT(`application.${job.applicationStatus}`)}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="mt-2 text-base">{job.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {job.description ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{job.description}</p> : null}
          {job.requirements ? <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs"><p className="font-medium">{t("requirements")}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{job.requirements}</p></div> : null}
          {job.logisticsNotes ? <p className="mt-3 text-xs text-muted-foreground">{job.logisticsNotes}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {job.scheduledDate ? <Badge variant="outline"><CalendarDays className="mr-1 size-3" />{format.dateTime(new Date(`${job.scheduledDate}T12:00:00`), { dateStyle: "medium" })}</Badge> : null}
            {job.payVisible && job.payAmount !== null ? <Badge><CircleDollarSign className="mr-1 size-3" />{format.number(job.payAmount, { style: "currency", currency: job.currency })}</Badge> : null}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{t("slots", { count: job.slots })}</span>
            <span>{format.dateTime(new Date(job.createdAt), { day: "numeric", month: "short" })}</span>
          </div>
        </CardContent>
        {job.status === "open" ? (
          <CardFooter>
            {job.applicationStatus ? (
              <p className="text-xs text-muted-foreground">{t("received")}</p>
            ) : (
              <Button className="w-full" onClick={() => setOpen(true)}>{t("apply")}</Button>
            )}
          </CardFooter>
        ) : null}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{job.title} · {job.zone}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`job-message-${job.id}`}>{t("message")}</Label>
              <Textarea
                id={`job-message-${job.id}`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={600}
                rows={5}
                placeholder={t("messagePlaceholder")}
              />
              <span className="text-right font-mono text-xs text-muted-foreground">{message.length}/600</span>
            </div>
            <Button onClick={submit} disabled={pending}>{pending ? t("sending") : t("submit")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
