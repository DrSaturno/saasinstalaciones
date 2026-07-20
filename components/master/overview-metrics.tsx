"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Overview = {
  companies: number;
  activeCompanies: number;
  users: number;
  installers: number;
  projects: number;
  sites: number;
  orders: number;
  openOrders: number;
};

const TILES: { key: keyof Overview; label: string; hint?: string }[] = [
  { key: "activeCompanies", label: "Empresas activas" },
  { key: "users", label: "Usuarios" },
  { key: "installers", label: "Instaladores" },
  { key: "projects", label: "Proyectos" },
  { key: "sites", label: "Puntos" },
  { key: "openOrders", label: "Órdenes abiertas" },
];

export function OverviewMetrics() {
  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ["master", "overview"],
    queryFn: async () => {
      const res = await fetch("/api/master/overview");
      if (!res.ok) throw new Error("No se pudo cargar el resumen");
      return res.json();
    },
  });

  if (error) {
    return (
      <p className="text-sm text-destructive">
        No se pudo cargar el resumen de la plataforma.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {TILES.map((tile) => (
        <Card key={tile.key}>
          <CardContent className="pt-6">
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="font-mono text-2xl font-medium">
                {data?.[tile.key] ?? 0}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{tile.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
