import { Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  companyName: string;
  relativeTime: string;
};

export function AnnouncementsCard({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: AnnouncementItem[];
}) {
  return (
    <Card className="mt-4">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              id={`anuncio-${item.id}`}
              className={`scroll-mt-20 rounded-xl border p-3 target:ring-2 target:ring-primary ${
                item.severity === "critical"
                  ? "border-destructive/30 bg-destructive/5"
                  : item.severity === "warning"
                    ? "border-warning/40 bg-amber-50/60"
                    : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{item.title}</p>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {item.relativeTime}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {item.body}
              </p>
              {item.companyName ? (
                <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {item.companyName}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
