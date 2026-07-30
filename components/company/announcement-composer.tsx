"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  publishAnnouncement,
  type AnnouncementState,
} from "@/lib/actions/announcements";
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
}: {
  zones: string[];
  projects: { id: string; name: string }[];
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
  return <ComposerForm key={state.announcementId ?? "draft"} {...{ t, formRef, formAction, pending, state, zones, projects }} />;
}

function ComposerForm({
  t,
  formRef,
  formAction,
  pending,
  state,
  zones,
  projects,
}: {
  t: ReturnType<typeof useTranslations<"Announcements">>;
  formRef: React.RefObject<HTMLFormElement | null>;
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: AnnouncementState;
  zones: string[];
  projects: { id: string; name: string }[];
}) {
  const [audienceType, setAudienceType] = useState<"all" | "zone" | "project">("all");

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
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
                name="audienceType"
                value={audienceType}
                onChange={(event) =>
                  setAudienceType(event.target.value as "all" | "zone" | "project")
                }
                className={selectClass}
                disabled={pending}
              >
                <option value="all">{t("audienceAll")}</option>
                <option value="zone">{t("audienceZone")}</option>
                <option value="project">{t("audienceProject")}</option>
              </select>
            </div>

            {audienceType === "zone" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="announcement-zone">{t("zoneLabel")}</Label>
                <select
                  id="announcement-zone"
                  name="audienceRef"
                  className={selectClass}
                  required
                  disabled={pending}
                >
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
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
                  name="audienceRef"
                  className={selectClass}
                  required
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

            {state.error ? (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="mt-auto">
              <Send className="size-3.5" aria-hidden="true" />
              {pending ? t("publishing") : t("publish")}
            </Button>
            <p className="text-[11px] leading-tight text-muted-foreground">{t("deliveryNote")}</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
