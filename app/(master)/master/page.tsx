import Link from "next/link";
import { OverviewMetrics } from "@/components/master/overview-metrics";
import { Button } from "@/components/ui/button";

export default function MasterHome() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tablero maestro</h1>
          <p className="mt-1 text-muted-foreground">
            Estado global de la plataforma.
          </p>
        </div>
        <Button asChild>
          <Link href="/master/companies">Gestionar empresas</Link>
        </Button>
      </div>

      <div className="mt-8">
        <OverviewMetrics />
      </div>
    </div>
  );
}
