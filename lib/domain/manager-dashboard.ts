import type { ProjectStatus } from "@/types/database";

const DAY = 86_400_000;
export type DashboardProjectHealth = "onTrack" | "atRisk" | "delayed" | "paused";

export function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

export function plannedProjectProgress(startDate: string | null, endDate: string | null, today: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00Z`).getTime();
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  const now = new Date(`${today}T12:00:00Z`).getTime();
  if (end <= start) return 0;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

export function projectHealth(input: {
  status: ProjectStatus;
  endDate: string | null;
  today: string;
  progress: number;
  plannedProgress: number;
}): DashboardProjectHealth {
  if (input.status === "paused") return "paused";
  if (input.endDate && input.endDate < input.today && input.progress < 100) return "delayed";
  if (input.plannedProgress - input.progress >= 15) return "atRisk";
  return "onTrack";
}

export function weeklyRequirement(remaining: number, endDate: string | null, today: string) {
  if (!endDate) return 0;
  const timeLeft = new Date(`${endDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime();
  if (timeLeft <= 0) return 0;
  return Math.ceil(remaining / Math.max(1 / 7, timeLeft / (7 * DAY)));
}

export function workload(total: number, capacity: number) {
  return capacity ? Math.round((total / capacity) * 100) : total ? 100 : 0;
}

export function firstResolutionSummary(
  finalized: { id: string; visitCount: number }[],
  revisitOrderIds: Set<string>,
) {
  const firstTime = finalized.filter((order) => order.visitCount <= 1 && !revisitOrderIds.has(order.id)).length;
  return {
    rate: percentage(firstTime, finalized.length),
    repeats: finalized.length - firstTime,
  };
}
