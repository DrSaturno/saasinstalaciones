import Link from "next/link";
import { ClipboardList, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActions({
  myOrders,
  findJobs,
}: {
  myOrders: string;
  findJobs: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <Button asChild variant="outline">
        <Link href="/tasks">
          <ClipboardList className="size-4" aria-hidden="true" />
          {myOrders}
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/jobs">
          <Wrench className="size-4" aria-hidden="true" />
          {findJobs}
        </Link>
      </Button>
    </div>
  );
}
