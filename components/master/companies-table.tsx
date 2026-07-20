"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateCompanyDialog } from "./create-company-dialog";

type Company = {
  id: string;
  name: string;
  country: "AR" | "BR";
  status: "active" | "suspended";
  order_prefix: string;
  created_at: string;
  projects: number;
  orders: number;
  users: number;
};

export function CompaniesTable() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ companies: Company[] }>({
    queryKey: ["master", "companies"],
    queryFn: async () => {
      const res = await fetch("/api/master/companies");
      if (!res.ok) throw new Error("No se pudieron cargar las empresas");
      return res.json();
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Company["status"] }) => {
      const res = await fetch(`/api/master/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo actualizar");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["master"] });
      toast.success(
        variables.status === "suspended" ? "Empresa suspendida" : "Empresa reactivada",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) {
    return <p className="text-sm text-destructive">No se pudieron cargar las empresas.</p>;
  }

  const companies = data?.companies ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Cargando…" : `${companies.length} empresa${companies.length === 1 ? "" : "s"}`}
        </p>
        <CreateCompanyDialog />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Usuarios</TableHead>
              <TableHead className="text-right">Proyectos</TableHead>
              <TableHead className="text-right">Órdenes</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Todavía no hay empresas. Creá la primera para empezar.
                </TableCell>
              </TableRow>
            )}

            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <span className="font-medium">{company.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {company.order_prefix}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">{company.country}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={
                      company.status === "active"
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {company.status === "active" ? "Activa" : "Suspendida"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{company.users}</TableCell>
                <TableCell className="text-right font-mono text-sm">{company.projects}</TableCell>
                <TableCell className="text-right font-mono text-sm">{company.orders}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={toggleStatus.isPending}
                    onClick={() =>
                      toggleStatus.mutate({
                        id: company.id,
                        status: company.status === "active" ? "suspended" : "active",
                      })
                    }
                  >
                    {company.status === "active" ? "Suspender" : "Reactivar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
