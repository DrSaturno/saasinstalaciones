"use client";

import { useState, useTransition } from "react";
import { MapPin, Users } from "lucide-react";
import { useRouter } from "next/navigation";
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
  applied: { label: "Postulado", className: "bg-lavender text-foreground" },
  accepted: { label: "Aceptado", className: "bg-success/15 text-success" },
  rejected: { label: "No seleccionado", className: "bg-muted text-muted-foreground" },
} as const;

export function JobCard({ job }: { job: InstallerJob }) {
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
    toast.success("Postulación enviada");
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <Card className={job.status === "closed" ? "opacity-70" : ""}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono text-xs text-primary"><MapPin className="size-3" />{job.zone}</span>
            {application ? <Badge className={application.className}>{application.label}</Badge> : null}
          </div>
          <CardTitle className="mt-2 text-base">{job.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {job.description ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{job.description}</p> : null}
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{job.slots} {job.slots === 1 ? "cupo" : "cupos"}</span>
            <span>{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(job.createdAt))}</span>
          </div>
        </CardContent>
        {job.status === "open" ? (
          <CardFooter>
            {job.applicationStatus ? (
              <p className="text-xs text-muted-foreground">La empresa ya recibió tu postulación.</p>
            ) : (
              <Button className="w-full" onClick={() => setOpen(true)}>Quiero postularme</Button>
            )}
          </CardFooter>
        ) : null}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Postularme</DialogTitle>
            <DialogDescription>{job.title} · {job.zone}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`job-message-${job.id}`}>Mensaje opcional</Label>
              <Textarea
                id={`job-message-${job.id}`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={600}
                rows={5}
                placeholder="Contá brevemente tu experiencia o disponibilidad…"
              />
              <span className="text-right font-mono text-xs text-muted-foreground">{message.length}/600</span>
            </div>
            <Button onClick={submit} disabled={pending}>{pending ? "Enviando…" : "Enviar postulación"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
