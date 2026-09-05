import Link from "next/link";
import { CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AbsenceItem = {
  id: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  statusLabel: string;
  dateRange: string;
  companyName: string;
  reviewNote: string;
};

export function AbsencesCard({
  title,
  help,
  empty,
  declare,
  showCompany,
  items,
}: {
  title: string;
  help: string;
  empty: string;
  declare: string;
  showCompany: boolean;
  items: AbsenceItem[];
}) {
  return (
    <Card className="mt-4">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">{help}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm">{item.reason}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-medium uppercase tracking-wider ${
                    item.status === "approved"
                      ? "bg-success/15 text-green-700"
                      : item.status === "rejected"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/15 text-amber-700"
                  }`}
                >
                  {item.statusLabel}
                </span>
              </div>
              <p className="mt-1 font-mono text-caption text-muted-foreground">
                {item.dateRange}
              </p>
              {showCompany && item.companyName ? (
                <p className="mt-1 text-caption font-medium text-primary">
                  {item.companyName}
                </p>
              ) : null}
              {item.reviewNote ? (
                <p className="mt-1 text-caption italic text-muted-foreground">
                  {item.reviewNote}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-muted-foreground">{empty}</p>
        )}
        <Button asChild variant="outline" size="sm" className="mt-1 sm:self-start">
          <Link href="/profile">{declare}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
