import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { EvidenceKind } from "@/lib/domain/order-evidence";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type FilterLabelKey =
  | "filterAll"
  | "filterMessage"
  | "filterImage"
  | "filterDocument"
  | "filterLink";

const KINDS: { value: EvidenceKind | null; labelKey: FilterLabelKey }[] = [
  { value: null, labelKey: "filterAll" },
  { value: "message", labelKey: "filterMessage" },
  { value: "image", labelKey: "filterImage" },
  { value: "document", labelKey: "filterDocument" },
  { value: "link", labelKey: "filterLink" },
];

/**
 * Formulario GET, sin JavaScript: los chips de tipo son links que preservan
 * la búsqueda de texto vigente; el texto se manda con Enter/submit. Ninguno
 * de los dos necesita un cliente para funcionar.
 */
export async function OrderEvidenceFilters({
  basePath,
  query,
  kind,
}: {
  basePath: string;
  query: string;
  kind: EvidenceKind | null;
}) {
  const t = await getTranslations("OrderEvidence");

  return (
    <div className="flex flex-col gap-3">
      <form method="get" className="flex gap-2">
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t("searchPlaceholder")}
          className="h-9"
        />
        <Button type="submit" size="sm" variant="outline">
          {t("search")}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((option) => {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          if (option.value) params.set("kind", option.value);
          const href = params.size > 0 ? `${basePath}?${params.toString()}` : basePath;
          const active = option.value === kind;
          return (
            <Link
              key={option.labelKey}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary-soft/40 text-primary"
                  : "border-input text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {t(option.labelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
