import { redirect } from "next/navigation";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { fetchInstallerReputation } from "@/lib/data/ratings";
import { createClient } from "@/lib/supabase/server";
import { StarRating } from "@/components/shared/star-rating";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function InstallerProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "installer") redirect(ROLE_HOME[user.role]);

  const supabase = await createClient();
  const reputation = await fetchInstallerReputation(supabase, user.id);

  if (!reputation) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <Card className="mt-6">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No pudimos cargar tu perfil de instalador.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Mi perfil</p>
          <h1 className="text-2xl font-bold">{user.fullName}</h1>
        </div>
        <Badge variant={reputation.available ? "secondary" : "outline"}>
          {reputation.available ? "Disponible" : "No disponible"}
        </Badge>
      </div>

      <Card className="mt-6 bg-primary-soft/25">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Reputación global
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span className="font-mono text-4xl font-semibold">
                {reputation.ratingCount > 0
                  ? reputation.ratingAvg.toFixed(1)
                  : "—"}
              </span>
              <span className="mb-1 text-sm text-muted-foreground">/ 5</span>
            </div>
          </div>
          <div className="sm:text-right">
            <StarRating value={reputation.ratingAvg} size="md" />
            <p className="mt-1 text-sm text-muted-foreground">
              {reputation.ratingCount === 1
                ? "1 trabajo calificado"
                : `${reputation.ratingCount} trabajos calificados`}
            </p>
          </div>
        </CardContent>
      </Card>

      {(reputation.zones.length > 0 || reputation.skills.length > 0) ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Experiencia</CardTitle>
            <CardDescription>
              La información que usan las empresas para asignar trabajo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {reputation.zones.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Zonas
                </p>
                <div className="flex flex-wrap gap-2">
                  {reputation.zones.map((zone) => (
                    <Badge key={zone} variant="secondary" className="font-mono">
                      {zone}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {reputation.skills.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Especialidades
                </p>
                <div className="flex flex-wrap gap-2">
                  {reputation.skills.map((skill) => (
                    <Badge key={skill} variant="outline">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Reseñas</h2>
            <p className="text-sm text-muted-foreground">
              Opiniones recibidas al cerrar órdenes.
            </p>
          </div>
          {reputation.ratingCount > reputation.reviews.length ? (
            <span className="text-xs text-muted-foreground">
              Últimas {reputation.reviews.length}
            </span>
          ) : null}
        </div>

        {reputation.reviews.length === 0 ? (
          <Card className="mt-4">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Todavía no recibiste calificaciones. Van a aparecer acá cuando
                una empresa cierre y califique uno de tus trabajos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {reputation.reviews.map((review) => (
              <Card key={review.id} size="sm">
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <StarRating value={review.stars} size="sm" />
                    <time
                      dateTime={review.createdAt}
                      className="shrink-0 font-mono text-xs text-muted-foreground"
                    >
                      {formatDate(review.createdAt)}
                    </time>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed">
                    {review.comment || "Sin comentario."}
                  </p>
                  {(review.orderNumber || review.orderTitle) ? (
                    <p className="mt-3 truncate text-xs text-muted-foreground">
                      {review.orderNumber ? (
                        <span className="font-mono">{review.orderNumber}</span>
                      ) : null}
                      {review.orderNumber && review.orderTitle ? " · " : null}
                      {review.orderTitle}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
