"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CircleCheck, Plus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { createIncident, resolveIncident } from "@/lib/actions/incidents";
import type { IncidentCategory, IncidentSeverity, IncidentStatus } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type IncidentRow = {
  id: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;
  requires_revisit: boolean;
  status: IncidentStatus;
  created_at: string;
};

const categories: IncidentCategory[] = ["failed_visit", "missing_materials", "client_absent", "technical_issue", "revisit_required", "complaint", "rejected_work", "incomplete_work", "other"];
const severities: IncidentSeverity[] = ["low", "medium", "high", "critical"];
const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20";

export function OrderIncidents({ orderId, incidents }: { orderId: string; incidents: IncidentRow[] }) {
  const t = useTranslations("OrderIncidents");
  const format = useFormatter();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createIncident({
        orderId,
        category: String(data.get("category")) as IncidentCategory,
        severity: String(data.get("severity")) as IncidentSeverity,
        description: String(data.get("description") ?? ""),
        requiresRevisit: data.get("requiresRevisit") === "on",
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("created"));
      setShowForm(false);
      router.refresh();
    });
  };

  const resolve = (id: string) => startTransition(async () => {
    const result = await resolveIncident(id, orderId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(t("resolved"));
    router.refresh();
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><TriangleAlert className="size-4 text-warning" aria-hidden="true" /><CardTitle>{t("title")}</CardTitle></div>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowForm((value) => !value)}><Plus className="size-4" aria-hidden="true" />{t("add")}</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {showForm ? (
          <form onSubmit={submit} className="grid gap-3 border-b bg-muted/30 p-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted-foreground">{t("category")}<select name="category" className={selectClass}>{categories.map((value) => <option key={value} value={value}>{t(`categories.${value}`)}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-muted-foreground">{t("severity")}<select name="severity" className={selectClass}>{severities.map((value) => <option key={value} value={value}>{t(`severityValues.${value}`)}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">{t("description")}<Textarea name="description" maxLength={2000} placeholder={t("descriptionPlaceholder")} /></label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="requiresRevisit" className="size-4 accent-primary" />{t("requiresRevisit")}</label>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button><Button type="submit" disabled={pending}>{pending ? t("saving") : t("save")}</Button></div>
          </form>
        ) : null}
        {incidents.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p> : (
          <div className="divide-y">
            {incidents.map((incident) => (
              <div key={incident.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{t(`categories.${incident.category}`)}</p><Badge variant={incident.severity === "critical" ? "destructive" : "outline"}>{t(`severityValues.${incident.severity}`)}</Badge>{incident.requires_revisit ? <Badge variant="outline">{t("revisit")}</Badge> : null}</div>
                    {incident.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{incident.description}</p> : null}
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">{format.dateTime(new Date(incident.created_at), { dateStyle: "short", timeStyle: "short" })}</p>
                  </div>
                  {incident.status === "open" ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => resolve(incident.id)}><CircleCheck className="size-4" aria-hidden="true" />{t("resolve")}</Button> : <Badge variant="secondary">{t("statusResolved")}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
