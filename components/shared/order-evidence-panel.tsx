import { FileText } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { EvidenceItem, EvidenceKind } from "@/lib/domain/order-evidence";
import { OrderEvidenceFilters } from "@/components/shared/order-evidence-filters";
import { EvidenceGallery, type GalleryImage } from "@/components/shared/evidence-gallery";
import { EvidenceThumb } from "@/components/shared/evidence-thumb";
import { EvidenceLink } from "@/components/shared/evidence-link";
import { HighlightedText } from "@/components/shared/highlighted-text";
import { Card, CardContent } from "@/components/ui/card";

/**
 * El espacio de comunicación y evidencia de una orden: mensajes, fotos,
 * documentos y enlaces en un solo lugar, buscable y filtrable. Reemplaza las
 * secciones separadas de "Historial" y "Adjuntos" que había antes.
 *
 * La caja para escribir entra como slot (`compose`) en vez de construirse acá:
 * la empresa escribe por Server Action y el instalador por la cola offline.
 * Son dos mecanismos distintos, y el panel no tiene por qué conocer ninguno.
 */
export async function OrderEvidencePanel({
  basePath,
  query,
  kind,
  compose,
  items,
  photoUrlByPath,
  authorNameById,
  currentUserId,
}: {
  basePath: string;
  query: string;
  kind: EvidenceKind | null;
  compose?: React.ReactNode;
  items: EvidenceItem[];
  photoUrlByPath: Map<string, string>;
  authorNameById: Map<string, string>;
  currentUserId: string | null;
}) {
  const [t, statusT, format] = await Promise.all([
    getTranslations("OrderEvidence"),
    getTranslations("Status"),
    getFormatter(),
  ]);

  // Una sola lista con TODAS las fotos de la orden, en el orden en que se ven:
  // el visor las recorre de corrido, que es como se mira evidencia.
  const images: GalleryImage[] = [];
  const indexByKey = new Map<string, number>();
  const register = (itemId: string, path: string, label: string) => {
    const url = photoUrlByPath.get(path);
    if (!url) return;
    indexByKey.set(`${itemId}:${path}`, images.length);
    images.push({ url, label });
  };
  for (const item of items) {
    if (item.kind === "image" && item.storagePath) {
      register(item.id, item.storagePath, item.body);
    } else if (item.kind === "message") {
      for (const path of item.photos) register(item.id, path, item.body || t("openImage"));
    }
  }

  const authorLabel = (item: EvidenceItem) => {
    // Las notas de cambio de estado las escribe la aplicación, no una persona:
    // atribuirlas a "alguien del equipo" sería inventar un autor. Se encontró
    // probando la función contra los datos reales de producción.
    if (item.subtype === "system") return statusT("update.system");
    if (!item.authorId) return t("unknownAuthor");
    if (item.authorId === currentUserId) return t("you");
    return authorNameById.get(item.authorId) ?? t("unknownAuthor");
  };

  const dateLabel = (createdAt: string) =>
    format.dateTime(new Date(createdAt), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">{t("title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
        </div>

        <OrderEvidenceFilters basePath={basePath} query={query} kind={kind} />

        {compose}

        {items.length === 0 ? (
          <p className="rounded-xl border bg-muted/25 p-4 text-center text-sm text-muted-foreground">
            {query || kind ? t("emptyFiltered") : t("empty")}
          </p>
        ) : (
          <EvidenceGallery images={images}>
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id} className="rounded-xl border bg-background p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {authorLabel(item)}
                      </span>
                      {/* Los hitos operativos se distinguen de un mensaje suelto:
                          un "Bloqueo" no se lee igual que un comentario. En las
                          del sistema se omite: el autor ya dice "Sistema" y
                          repetirlo al lado no agrega nada. */}
                      {item.subtype && item.subtype !== "message" && item.subtype !== "system" ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                          {statusT(`update.${item.subtype}`)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono">{dateLabel(item.occurredAt)}</span>
                  </div>

                  {/* La traza que pide REQ-14.2: de dónde a dónde pasó la
                      orden, en columnas y no dentro de una frase traducida.
                      Antes esto sólo existía como texto en prosa, así que
                      reconstruir el historial obligaba a parsearlo. */}
                  {item.toStatus ? (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      {item.fromStatus ? (
                        <>
                          <span>{statusT(`order.${item.fromStatus}`)}</span>
                          <span aria-hidden="true">→</span>
                        </>
                      ) : null}
                      <span className="font-medium text-foreground">
                        {statusT(`order.${item.toStatus}`)}
                      </span>
                      {/* Sólo cuando difieren: en todo lo escrito desde el
                          escritorio son el mismo instante y repetirlo sería
                          ruido. Un evento sincronizado tarde sí necesita
                          decir cuándo llegó (REQ-14.7). */}
                      {item.occurredAt !== item.createdAt ? (
                        <span className="ml-1">
                          {t("syncedAt", { at: dateLabel(item.createdAt) })}
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {item.kind === "message" ? (
                    <div className="mt-1.5">
                      {item.body ? (
                        <p className="whitespace-pre-wrap text-sm">
                          <HighlightedText text={item.body} query={query} />
                        </p>
                      ) : null}

                      {item.links.length > 0 ? (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {item.links.map((link) => (
                            <EvidenceLink key={link} url={link} />
                          ))}
                        </div>
                      ) : null}

                      {item.photos.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.photos.map((path) => {
                            const index = indexByKey.get(`${item.id}:${path}`);
                            if (index === undefined) return null;
                            return (
                              <EvidenceThumb
                                key={path}
                                url={images[index].url}
                                label={images[index].label}
                                index={index}
                                size="sm"
                              />
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : item.kind === "image" ? (
                    <div className="mt-2">
                      {(() => {
                        const index = item.storagePath
                          ? indexByKey.get(`${item.id}:${item.storagePath}`)
                          : undefined;
                        if (index === undefined) {
                          return <p className="text-sm">{item.body}</p>;
                        }
                        return (
                          <EvidenceThumb
                            url={images[index].url}
                            label={images[index].label}
                            index={index}
                          />
                        );
                      })()}
                    </div>
                  ) : (
                    <a
                      href={item.storagePath ? photoUrlByPath.get(item.storagePath) : undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 flex items-center gap-2 text-sm hover:underline"
                    >
                      <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <HighlightedText text={item.body} query={query} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </EvidenceGallery>
        )}
      </CardContent>
    </Card>
  );
}
