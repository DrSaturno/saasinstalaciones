/**
 * Encabezado de sección del dashboard — no reemplaza ningún `Card`
 * existente, sólo los agrupa bajo un título con jerarquía propia, un nivel
 * arriba de `CardTitle`.
 */
export function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
