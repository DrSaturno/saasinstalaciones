import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WeatherCard({
  title,
  forecasts,
}: {
  title: string;
  forecasts: {
    name: string;
    min: number;
    max: number;
    wind: number;
    severity: "ok" | "warning" | "danger";
  }[];
}) {
  if (!forecasts.length) return null;

  return (
    <Card className="mt-4">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {forecasts.map((zone) => (
          <div
            key={zone.name}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="truncate font-medium">{zone.name}</span>
            <span
              className={`font-mono text-xs ${
                zone.severity === "danger"
                  ? "text-destructive"
                  : zone.severity === "warning"
                    ? "text-amber-700"
                    : "text-muted-foreground"
              }`}
            >
              {Math.round(zone.max)}° / {Math.round(zone.min)}° ·{" "}
              {Math.round(zone.wind)} km/h
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
