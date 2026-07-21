"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { addUnavailability, removeUnavailability, saveWeeklyAvailability } from "@/lib/actions/availability";
import { countryTimezone, type WeeklyAvailabilityInput } from "@/lib/domain/availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AvailabilityCompany } from "@/lib/data/availability";

export function AvailabilityCompanyCard({ company, disabled }: { company: AvailabilityCompany; disabled: boolean }) {
  const t = useTranslations("Availability");
  const format = useFormatter();
  const timezone = countryTimezone(company.country);
  const [weekly, setWeekly] = useState<WeeklyAvailabilityInput[]>(company.weekly);
  const [exceptions, setExceptions] = useState(company.exceptions);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const days = useMemo(() => [t("days.sun"), t("days.mon"), t("days.tue"), t("days.wed"), t("days.thu"), t("days.fri"), t("days.sat")], [t]);

  const updateDay = (weekday: number, enabled: boolean) => setWeekly((current) => enabled
    ? [...current, { weekday, startsAt: "09:00", endsAt: "18:00", timezone }]
    : current.filter((entry) => entry.weekday !== weekday));
  const updateTime = (weekday: number, field: "startsAt" | "endsAt", value: string) => setWeekly((current) => current.map((entry) => entry.weekday === weekday ? { ...entry, [field]: value } : entry));

  const save = () => startTransition(async () => {
    const result = await saveWeeklyAvailability(company.id, weekly);
    if (result.error) toast.error(result.error);
    else toast.success(t("scheduleSaved"));
  });

  const addException = () => {
    if (!startsAt || !endsAt || !reason.trim()) return;
    startTransition(async () => {
      const result = await addUnavailability(company.id, { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), reason });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.id) {
        toast.error(t("unknownError"));
        return;
      }
      setExceptions((current) => [...current, { id: result.id!, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), reason }]);
      setStartsAt(""); setEndsAt(""); setReason(""); toast.success(t("exceptionSaved"));
    });
  };

  const remove = (id: string) => startTransition(async () => {
    const result = await removeUnavailability(company.id, id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setExceptions((current) => current.filter((item) => item.id !== id));
    toast.success(t("exceptionRemoved"));
  });

  return (
    <Card>
      <CardHeader><CardTitle>{company.name}</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div><h3 className="text-sm font-medium">{t("weekly")}</h3><p className="text-xs text-muted-foreground">{t("weeklyHelp")}</p></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{days.map((label, weekday) => {
          const entry = weekly.find((item) => item.weekday === weekday);
          return <div key={label} className="rounded-xl border p-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(entry)} onChange={(event) => updateDay(weekday, event.target.checked)} disabled={disabled || pending} className="accent-primary" />{label}</label>{entry ? <div className="mt-3 flex items-center gap-2"><Input type="time" value={entry.startsAt} onChange={(event) => updateTime(weekday, "startsAt", event.target.value)} disabled={disabled || pending} /><Input type="time" value={entry.endsAt} onChange={(event) => updateTime(weekday, "endsAt", event.target.value)} disabled={disabled || pending} /></div> : null}</div>;
        })}</div>
        <Button type="button" onClick={save} disabled={disabled || pending}>{t("saveSchedule")}</Button>

        <div className="border-t pt-5"><h3 className="text-sm font-medium">{t("exceptions")}</h3><p className="text-xs text-muted-foreground">{t("exceptionsHelp")}</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor={`unavailable-from-${company.id}`}>{t("from")}</Label><Input id={`unavailable-from-${company.id}`} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} disabled={disabled || pending} /></div><div className="flex flex-col gap-2"><Label htmlFor={`unavailable-to-${company.id}`}>{t("to")}</Label><Input id={`unavailable-to-${company.id}`} type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} disabled={disabled || pending} /></div><div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor={`unavailable-reason-${company.id}`}>{t("reason")}</Label><Input id={`unavailable-reason-${company.id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={disabled || pending} placeholder={t("reasonPlaceholder")} /></div></div>
        <Button type="button" variant="outline" onClick={addException} disabled={disabled || pending || !startsAt || !endsAt || !reason.trim()}>{t("addException")}</Button>
        {exceptions.length ? <div className="space-y-2">{exceptions.map((exception) => <div key={exception.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3"><div><p className="text-sm font-medium">{exception.reason}</p><p className="font-mono text-xs text-muted-foreground">{format.dateTime(new Date(exception.startsAt), { dateStyle: "short", timeStyle: "short" })} — {format.dateTime(new Date(exception.endsAt), { dateStyle: "short", timeStyle: "short" })}</p></div><Button type="button" size="sm" variant="ghost" onClick={() => remove(exception.id)} disabled={pending}>{t("removeException")}</Button></div>)}</div> : null}
      </CardContent>
    </Card>
  );
}
