import { Skeleton } from "@/components/ui/skeleton";

export default function MasterLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="mt-2 h-4 w-64" />

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="mt-10 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
