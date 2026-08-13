"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { resolveLocationIssue } from "@/lib/actions/location-issues";
import type { LocationIssue } from "@/lib/data/location-issues";
import { VARIANT_FIELDS } from "@/lib/domain/location-issues";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Una fila de la cola de revisión.
 *
 * En un conflicto se muestran las variantes en columnas y se resaltan los
 * campos que difieren: con dos direcciones en ciudades distintas la decisión se
 * toma de un vistazo, sin abrir cada punto.
 */
export function LocationIssueCard({ issue }: { issue: LocationIssue }) {
  const t = useTranslations("LocationReview");
  const [state, action, pending] = useActionState(resolveLocationIssue, {
    error: null,
  });
  const [decision, setDecision] = useState<"resolved" | "ignored" | null>(null);

  if (state.ok) {
    return (
      <article className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t("closed")}
      </article>
    );
  }

  const { variants, differing } = issue.comparison;
  const hasVariants = variants.length > 0;

  return (
    <article className="rounded-xl border bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">{t(`code.${issue.code}`)}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("scope", {
              client: issue.clientName ?? "—",
              project: issue.projectName ?? "—",
            })}
          </p>
        </div>
        <div className="text-right text-sm">
          {issue.externalRef && (
            <p className="font-mono">{issue.externalRef}</p>
          )}
          <p className="text-muted-foreground">
            {t("affects", { count: issue.siteCount })}
          </p>
        </div>
      </header>

      {hasVariants ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <tbody>
              {VARIANT_FIELDS.filter((field) =>
                variants.some((variant) => (variant[field] ?? "") !== ""),
              ).map((field) => {
                const differs = differing.includes(field);
                return (
                  <tr key={field} className="border-b last:border-0">
                    <th className="w-32 py-2 pr-3 text-left font-normal text-muted-foreground">
                      {t(`field.${field}`)}
                    </th>
                    {variants.map((variant, index) => (
                      <td
                        key={index}
                        className={`py-2 pr-3 ${differs ? "font-medium text-warning" : ""}`}
                      >
                        {variant[field] || "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {differing.length > 0 && (
            <p className="mt-2 text-xs text-warning">
              {t("differing", { count: differing.length })}
            </p>
          )}
        </div>
      ) : (
        <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          {(["name", "address", "city", "state"] as const)
            .filter((key) => issue.context[key])
            .map((key) => (
              <div key={key} className="flex gap-2">
                <dt className="text-muted-foreground">{t(`field.${key}`)}</dt>
                <dd>{issue.context[key]}</dd>
              </div>
            ))}
        </dl>
      )}

      <p className="mt-3 text-sm text-muted-foreground">
        {t(`hint.${issue.code}`)}
      </p>

      {decision ? (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="decision" value={decision} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`note-${issue.id}`}>{t("noteLabel")}</Label>
            <Textarea
              id={`note-${issue.id}`}
              name="note"
              rows={3}
              required
              minLength={10}
              placeholder={t("notePlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("noteWhy")}</p>
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t(`confirm.${decision}`)}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDecision(null)}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => setDecision("resolved")}>
            {t("action.resolved")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDecision("ignored")}
          >
            {t("action.ignored")}
          </Button>
        </div>
      )}
    </article>
  );
}
