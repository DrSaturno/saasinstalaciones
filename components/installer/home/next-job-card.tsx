import Link from "next/link";
import { Navigation } from "lucide-react";
import type { InstallerHome } from "@/lib/data/installer-home";
import { googleMapsHref } from "@/lib/domain/sites";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NextJobCard({
  job,
  formattedDate,
  showCompany,
  labels,
}: {
  job: InstallerHome["nextJob"];
  formattedDate: string | null;
  showCompany: boolean;
  labels: {
    title: string;
    empty: string;
    open: string;
    directions: string;
  };
}) {
  const maps = job
    ? googleMapsHref({
        lat: job.lat,
        lng: job.lng,
        address: job.address,
        city: job.city,
      })
    : null;

  return (
    <Card className="mt-6">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Navigation className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>{labels.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {job ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/tasks/${job.id}`}
                  className="font-medium hover:text-primary"
                >
                  {job.title}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">
                  {job.orderNumber}
                </p>
              </div>
              <StatusBadge status={job.status} kind="order" />
            </div>
            <p className="text-sm text-muted-foreground">
              {[job.siteName, job.address, job.city]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {showCompany && job.companyName ? (
              <p className="text-xs font-medium text-primary">
                {job.companyName}
              </p>
            ) : null}
            {formattedDate ? (
              <p className="font-mono text-xs text-muted-foreground">
                {formattedDate}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={`/tasks/${job.id}`}>{labels.open}</Link>
              </Button>
              {maps ? (
                <Button asChild size="sm" variant="outline">
                  <a href={maps} target="_blank" rel="noreferrer">
                    {labels.directions}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {labels.empty}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
