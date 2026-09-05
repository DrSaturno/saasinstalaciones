import { CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WeekGrid({
  title,
  subtitle,
  days,
}: {
  title: string;
  subtitle?: string;
  days: { date: string; label: string; total: number }[];
}) {
  return (
    <Card className="mt-4">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
        </div>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, index) => (
            <div
              key={day.date}
              className={`rounded-lg border p-1.5 text-center ${
                index === 0 ? "border-primary/40 bg-primary-soft/25" : ""
              }`}
            >
              <p className="text-caption capitalize text-muted-foreground">
                {day.label}
              </p>
              <p className="font-mono text-base font-semibold leading-tight">
                {day.total}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
