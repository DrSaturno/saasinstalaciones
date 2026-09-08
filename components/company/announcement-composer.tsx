"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Megaphone, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  previewAnnouncementAudience,
  publishAnnouncement,
  type AnnouncementState,
} from "@/lib/actions/announcements";
import type { PublishedAnnouncement } from "@/lib/data/announcements";
import { AnnouncementsHistoryDialog } from "@/components/company/announcements-history-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: AnnouncementState = { error: null };
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AnnouncementComposer({
  zones,
  projects,
  history,
}: {
  zones: string[];
  projects: { id: string; name: string }[];
  history: PublishedAnnouncement[];
}) {
  const t = useTranslations("Announcements");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(publishAnnouncement, initial);

  useEffect(() => {
    if (state.ok) {
      // El email sale después de responder, así que acá no se sabe (ni importa)
      // si se envió: el anuncio ya está en la bandeja de todos.
      toast.success(t("published", { count: state.recipients ?? 0 }));
      formRef.current?.reset();
    }
  }, [state, t]);

  // La key es el id del anuncio publicado: cambia en CADA publicación, así que
  // React remonta el formulario y el selector de público vuelve solo a "todo el
  // equipo". Con un booleano, dos envíos seguidos daban la misma key y el
  // selector se quedaba con la elección anterior.
  return <ComposerForm key={state.announcementId ?? "draft"} {...{ t, formRef, formAction, pending, state, zones, projects, history }} />;
}

function ComposerForm({
  t,
  formRef,
  formAction,
  pending,
  state,
  zones,
  projects,
  history,
}: {
  t: ReturnType<typeof useTranslations<"Announcements">>;
  formRef: React.RefObject<HTMLFormElement | null>;
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: AnnouncementState;
  zones: string[];
  projects: { id: string; name: string }[];
  history: PublishedAnnouncement[];
}) {
  // Un solo criterio por anuncio: o va a todo el equipo, o a una provincia, o a
  // un proyecto. Combinarlos obligaba a razonar sobre intersecciones para
  // mandar un aviso.
  const [audienceType, setAudienceType] = useState<"all" | "zone" | "project">("all");
  const [zone, setZone] = useState<string>(zones[0] ?? "");
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, startPreview] = useTransition();

  // El conteo se pide al servidor con la misma función que arma el público
  // al publicar, así que lo que dice acá es lo que va a pasar.
  useEffect(() => {
    startPreview(async () => {
      const { count } = await previewAnnouncementAudience({
        zones: audienceType === "zone" && zone ? [zone] : [],
        projectIds: audienceType === "project" && projectId ? [projectId] : [],
      });
      setPreview(count);
    });
  }, [audienceType, zone, projectId]);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="size-4 text-primary" aria-hidden="true" />
              <CardTitle>{t("title")}</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <AnnouncementsHistoryDialog announcements={history} />
        </div>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-title">{t("titleLabel")}</Label>
              <Input
                id="announcement-title"
                name="title"
                maxLength={120}
                placeholder={t("titlePlaceholder")}
                required
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-body">{t("bodyLabel")}</Label>
              <Textarea
                id="announcement-body"
                name="body"
                rows={4}
                maxLength={2000}
                placeholder={t("bodyPlaceholder")}
                required
                disabled={pending}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-severity">{t("severityLabel")}</Label>
              <select
                id="announcement-severity"
                name="severity"
                defaultValue="info"
                className={selectClass}
                disabled={pending}
              >
                <option value="info">{t("severityInfo")}</option>
                <option value="warning">{t("severityWarning")}</option>
                <option value="critical">{t("severityCritical")}</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-audience">{t("audienceLabel")}</Label>
              <select
                id="announcement-audience"
                value={audienceType}
                onChange={(event) => setAudienceType(event.target.value as typeof audienceType)}
                className={selectClass}
                disabled={pending}
              >
                <option value="all">{t("audienceAll")}</option>
                {/* Sin provincias (o sin proyectos) el criterio no se ofrece: el
                    select quedaría vacío, no se enviaría ningún valor y el
                    anuncio se iría a TODO el equipo diciendo que va a una sola
                    provincia. */}
                {zones.length ? <option value="zone">{t("audienceZone")}</option> : null}
                {projects.length ? <option value="project">{t("audienceProject")}</option> : null}
              </select>
              <p className="text-caption text-muted-foreground">{t("audienceHelp")}</p>
            </div>

            {audienceType === "zone" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="announcement-zone">{t("zoneLabel")}</Label>
                <select
                  id="announcement-zone"
                  name="zones"
                  value={zone}
                  onChange={(event) => setZone(event.target.value)}
                  className={selectClass}
                  disabled={pending}
                >
                  {zones.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {audienceType === "project" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="announcement-project">{t("projectLabel")}</Label>
                <select
                  id="announcement-project"
                  name="projectIds"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className={selectClass}
                  disabled={pending}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {/* El conteo sale de la misma consulta que el envío: si dice 3, se
                le manda a 3. Cero se avisa fuerte — antes publicar a nadie era
                silencioso. */}
            <p
              className={`rounded-lg border px-3 py-2 text-xs ${
                preview === 0
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "bg-muted/40 text-muted-foreground"
              }`}
              aria-live="polite"
            >
              {previewing || preview === null
                ? t("previewLoading")
                : preview === 0
                  ? t("previewEmpty")
                  : t("previewCount", { count: preview })}
            </p>

            {state.error ? (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending || preview === 0} className="mt-auto">
              <Send className="size-3.5" aria-hidden="true" />
              {pending ? t("publishing") : t("publish")}
            </Button>
            <p className="text-caption leading-tight text-muted-foreground">{t("deliveryNote")}</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
