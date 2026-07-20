import { CompaniesTable } from "@/components/master/companies-table";

export default function MasterCompaniesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Empresas</h1>
      <p className="mt-1 text-muted-foreground">
        Alta, suspensión y estado de las empresas que usan la plataforma.
      </p>
      <div className="mt-8">
        <CompaniesTable />
      </div>
    </div>
  );
}
