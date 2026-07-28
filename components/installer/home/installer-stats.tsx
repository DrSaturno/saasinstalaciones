import type { InstallerStats as InstallerStatsData } from "@/lib/data/installer-home";
import { Stat } from "./stat";

export function InstallerStats({
  stats,
  labels,
}: {
  stats: InstallerStatsData;
  labels: {
    assigned: string;
    inProgress: string;
    doneToday: string;
    pending: string;
  };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label={labels.assigned} value={stats.assigned} />
      <Stat label={labels.inProgress} value={stats.inProgress} highlight />
      <Stat label={labels.doneToday} value={stats.doneToday} />
      <Stat label={labels.pending} value={stats.pending} />
    </div>
  );
}
