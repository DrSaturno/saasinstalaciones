"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { FileText, Images, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSiteGalleryItem } from "@/lib/actions/site-gallery";
import type { SiteGalleryItem } from "@/lib/data/site-gallery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Historial visual de la locación: adjuntos de sus órdenes y fotos de los
 * avances, todo junto. La locación es lo permanente; las órdenes pasan.
 */
export function SiteGallery({
  siteId,
  items,
  canDelete,
}: {
  siteId: string;
  items: SiteGalleryItem[];
  canDelete: boolean;
}) {
  const t = useTranslations("SiteGallery");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState<string[]>([]);

  const visible = items.filter((item) => !removed.includes(item.key));

  const remove = (item: SiteGalleryItem) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const res = await deleteSiteGalleryItem({
        siteId,
        storagePath: item.storagePath,
        attachmentId: item.attachmentId,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setRemoved((current) => [...current, item.key]);
      toast.success(t("deleted"));
    });
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Images className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
          {visible.length > 0 ? (
            <span className="font-mono text-xs text-muted-foreground">
              {visible.length}
            </span>
          ) : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("help")}</p>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) => (
              <figure key={item.key} className="group relative">
                {item.isImage && item.signedUrl ? (
                  <a href={item.signedUrl} target="_blank" rel="noreferrer">
                    <Image
                      src={item.signedUrl}
                      alt=""
                      width={320}
                      height={240}
                      unoptimized
                      className="h-32 w-full rounded-lg border object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-lg border bg-muted/25">
                    <FileText className="size-8 text-primary" aria-hidden="true" />
                  </div>
                )}

                {canDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => remove(item)}
                    disabled={pending}
                    aria-label={t("delete")}
                    className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}

                {item.fromProject ? (
                  <span
                    className="absolute left-1.5 top-1.5 max-w-[85%] truncate rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium"
                    title={t("fromProject", { project: item.fromProject })}
                  >
                    {item.fromProject}
                  </span>
                ) : null}

                <figcaption className="mt-1.5 text-xs">
                  <Link
                    href={`/orders/${item.orderId}`}
                    className="font-mono text-[11px] text-muted-foreground hover:text-primary"
                  >
                    {item.orderNumber}
                  </Link>
                  <p className="truncate text-muted-foreground" title={item.note}>
                    {item.note}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {format.dateTime(new Date(item.createdAt), {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
