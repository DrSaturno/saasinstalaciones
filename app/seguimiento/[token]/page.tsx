import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rate-limit";
import { OrderCompletionPie } from "@/components/company/order-completion-pie";
import type { OrderStatus, ProjectStatus } from "@/types/database";

type Milestone = { site: string; title: string; status: OrderStatus; date: string | null };

// Discriminada por `valid`: así TypeScript angosta los campos de abajo a
// obligatorios apenas se descarta el caso `false`, sin optionals fantasma
// que puedan colarse como `undefined` en una clave de traducción.
type Snapshot =
  | { valid: false }
  | {
      valid: true;
      projectName: string;
      clientName: string;
      status: ProjectStatus;
      completionPct: number;
      doneCount: number;
      totalCount: number;
      milestones: Milestone[];
      photoPaths: string[];
    };

/**
 * Seguimiento público para el cliente final (bloque 7,
 * docs/specs/2026-09-24-link-cliente). Sin sesión: `createClient()` sin
 * cookie de auth corre como `anon`, que es justo lo que
 * `project_tracking_snapshot` espera. Nunca importes, nombres de instalador
 * ni teléfonos — ver design.md para qué expone y por qué.
 */
export default async function ProjectTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [t, statusT, format] = await Promise.all([
    getTranslations("ProjectTracking"),
    getTranslations("Status"),
    getFormatter(),
  ]);

  // Defensa contra scraping/abuso, no contra fuerza bruta del token (128 bits
  // ya la hace inviable) — mismo mecanismo que `/login` y el reset de
  // contraseña.
  const gate = await enforceRateLimit("project_tracking", await clientIp(), 30, 300);
  if (!gate.allowed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-semibold">{t("rateLimited")}</h1>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("project_tracking_snapshot", { p_token: token });
  const snapshot = data as Snapshot | null;

  if (!snapshot?.valid) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-semibold">{t("invalidTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("invalidDescription")}</p>
      </main>
    );
  }

  const milestones = snapshot.milestones;
  const photoPaths = snapshot.photoPaths;
  const photoUrls = photoPaths.length
    ? await supabase.storage.from("evidence").createSignedUrls(photoPaths, 60 * 30)
    : { data: [] };
  const signedPhotoUrls = (photoUrls.data ?? [])
    .map((item) => item.signedUrl)
    .filter((url): url is string => Boolean(url));

  // Conteos SIN el tope de 200 de `milestones`: un proyecto grande tiene que
  // mostrar la torta correcta aunque la lista de hitos esté recortada.
  const total = snapshot.totalCount ?? 0;
  const done = snapshot.doneCount ?? 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {t("eyebrow")}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{snapshot.projectName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{snapshot.clientName}</p>

      <div className="mt-8 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("progressLabel")}</p>
            <p className="text-xs text-muted-foreground">
              {statusT(`project.${snapshot.status}`)}
            </p>
          </div>
          <OrderCompletionPie
            done={done}
            total={total}
            doneLabel={t("done")}
            openLabel={t("open")}
          />
        </div>
      </div>

      {milestones.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold">{t("milestonesTitle")}</h2>
          <div className="mt-3 divide-y rounded-2xl border bg-card">
            {milestones.map((m, index) => (
              <div key={index} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.site}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium">{statusT(`order.${m.status}`)}</p>
                  {m.date ? (
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(`${m.date}T12:00:00`), { dateStyle: "medium" })}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {signedPhotoUrls.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold">{t("photosTitle")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {signedPhotoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta vida, no vale la pena el pipeline de <Image>.
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-10 text-center text-xs text-muted-foreground">{t("footer")}</p>
    </main>
  );
}
