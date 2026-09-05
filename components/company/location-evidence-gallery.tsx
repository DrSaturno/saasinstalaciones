import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FileText, Images } from "lucide-react";
import type { LocationEvidenceView } from "@/lib/data/location-detail";

export async function LocationEvidenceGallery({ items }: { items: LocationEvidenceView[] }) {
  const [t, format] = await Promise.all([
    getTranslations("CanonicalLocation"),
    getFormatter(),
  ]);

  return (
    <section id="evidencia" aria-labelledby="location-evidence-title">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
          <Images className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="location-evidence-title" className="text-lg font-semibold">
            {t("evidence.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("evidence.description")}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("evidence.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <figure key={item.key} className="overflow-hidden rounded-xl border bg-card [content-visibility:auto]">
              {item.isImage && item.signedUrl ? (
                <a href={item.signedUrl} target="_blank" rel="noreferrer">
                  <Image
                    src={item.signedUrl}
                    alt={item.fileName}
                    width={420}
                    height={300}
                    unoptimized
                    className="h-36 w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                  />
                </a>
              ) : (
                <a
                  href={item.signedUrl ?? undefined}
                  target={item.signedUrl ? "_blank" : undefined}
                  rel={item.signedUrl ? "noreferrer" : undefined}
                  className="flex h-36 items-center justify-center bg-muted/35"
                  aria-disabled={item.signedUrl ? undefined : true}
                >
                  <FileText className="size-9 text-primary" aria-hidden="true" />
                </a>
              )}
              <figcaption className="space-y-1 p-3">
                <p className="truncate text-xs font-medium" title={item.note || item.fileName}>
                  {item.note || (item.origin === "order_update" ? t("evidence.progressPhoto") : t("evidence.orderAttachment"))}
                </p>
                <p className="truncate text-caption text-muted-foreground" title={item.projectName}>
                  {item.projectName || t("history.unknownProject")}
                </p>
                <div className="flex items-center justify-between gap-2 font-mono text-caption text-muted-foreground">
                  <Link href={`/orders/${item.orderId}`} className="truncate transition-colors hover:text-primary">
                    {item.orderNumber}
                  </Link>
                  <span className="shrink-0">
                    {format.dateTime(new Date(item.createdAt), {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
