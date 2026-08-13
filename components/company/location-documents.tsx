import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { FileText, Paperclip } from "lucide-react";
import type { LocationDocumentView } from "@/lib/data/location-detail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function categoryKey(category: string): "general" | "permit" | "access" | "risk" | "plan" | "other" {
  switch (category) {
    case "permit":
    case "access":
    case "risk":
    case "plan":
    case "other":
      return category;
    default:
      return "general";
  }
}

export async function LocationDocuments({ items }: { items: LocationDocumentView[] }) {
  const [t, format] = await Promise.all([
    getTranslations("CanonicalLocation"),
    getFormatter(),
  ]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-4 text-primary" aria-hidden="true" />
          {t("documents.title")}
          {items.length ? <span className="font-mono text-xs text-muted-foreground">{items.length}</span> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("documents.description")}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("documents.empty")}</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <a
                key={`${item.source}-${item.id}`}
                href={item.signedUrl ?? undefined}
                target={item.signedUrl ? "_blank" : undefined}
                rel={item.signedUrl ? "noreferrer" : undefined}
                aria-disabled={item.signedUrl ? undefined : true}
                className="flex gap-3 rounded-xl border p-2.5 transition-colors hover:border-primary/35 hover:bg-muted/30"
              >
                {item.mimeType.startsWith("image/") && item.signedUrl ? (
                  <Image src={item.signedUrl} alt="" width={72} height={72} unoptimized className="size-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-6" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.fileName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t(`documents.category.${categoryKey(item.category)}`)}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {t("documents.sizeMb", {
                        size: format.number(item.sizeBytes / 1_048_576, {
                          maximumFractionDigits: 1,
                        }),
                      })}
                    </span>
                  </span>
                  {item.description ? <span className="mt-1 block truncate text-xs text-muted-foreground">{item.description}</span> : null}
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
