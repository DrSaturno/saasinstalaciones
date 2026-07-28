import Link from "next/link";
import type { CoordinationHome } from "@/lib/data/coordination-home";
import { ORDER_STATUS, ORDER_STATUS_ORDER } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import { Stat } from "./stat";

export function CoordinationStats({
  data,
  labels,
  statusLabels,
}: {
  data: CoordinationHome;
  labels: {
    pendingReview: string;
    unassigned: string;
    doneToday: string;
    total: string;
    byStatus: string;
    open: string;
  };
  statusLabels: Record<(typeof ORDER_STATUS_ORDER)[number], string>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label={labels.pendingReview}
          value={data.byStatus.en_revision}
          highlight
        />
        <Stat label={labels.unassigned} value={data.unassigned} />
        <Stat label={labels.doneToday} value={data.doneToday} />
        <Stat label={labels.total} value={data.total} />
      </div>

      <p className="mt-4 text-xs font-medium text-muted-foreground">
        {labels.byStatus}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ORDER_STATUS_ORDER.map((status) => (
          <span
            key={status}
            className="rounded-full border px-3 py-1 text-xs"
            style={{
              backgroundColor: ORDER_STATUS[status].bg,
              color: ORDER_STATUS[status].fg,
            }}
          >
            {statusLabels[status]}{" "}
            <span className="font-mono font-semibold">
              {data.byStatus[status]}
            </span>
          </span>
        ))}
      </div>

      <Button asChild className="mt-4 w-full sm:w-auto">
        <Link href="/coordination">{labels.open}</Link>
      </Button>
    </>
  );
}
