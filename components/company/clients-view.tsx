"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClientSummary } from "@/lib/data/clients";
import { ViewToggle, useViewMode } from "@/components/shared/view-toggle";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Listado de clientes en tarjetas o tabla, a elección de quien mira. */
export function ClientsView({ clients }: { clients: ClientSummary[] }) {
  const t = useTranslations("Clients");
  const common = useTranslations("Common");
  const [mode, setMode] = useViewMode("view:clients", "board");

  if (!clients.length) {
    return <p className="mt-12 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <>
      <div className="mt-6 flex justify-end">
        <ViewToggle
          value={mode}
          onChange={setMode}
          labels={{ list: common("viewList"), board: common("viewBoard") }}
        />
      </div>

      {mode === "board" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card interactive className="h-full">
                <CardContent className="pt-6">
                  <h2 className="font-semibold">{client.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {client.contactName || client.email || t("noContact")}
                  </p>
                  <div className="mt-5 flex gap-5 font-mono text-sm">
                    <span>{t("projectCount", { count: client.projectCount })}</span>
                    <span>{t("siteCount", { count: client.siteCount })}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("contact")}</TableHead>
                <TableHead className="text-right">{t("projectsColumn")}</TableHead>
                <TableHead className="text-right">{t("sitesColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <Link href={`/clients/${client.id}`} className="font-medium hover:text-primary">
                      {client.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {client.contactName || client.email || t("noContact")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {client.projectCount}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{client.siteCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
