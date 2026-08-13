"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  fetchReusableLocations,
  reuseLocations,
} from "@/lib/actions/projects/reuse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ReusableLocation = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  externalRef: string | null;
  projectName: string;
};

/**
 * Trae al proyecto actual locaciones que el mismo cliente ya tiene cargadas en
 * proyectos anteriores, para no volver a cargarlas a mano.
 */
export function ReuseSitesDialog({
  projectId,
  autoOpen = false,
  hideTrigger = false,
}: {
  projectId: string;
  autoOpen?: boolean;
  hideTrigger?: boolean;
}) {
  const t = useTranslations("ReuseSites");
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [locations, setLocations] = useState<ReusableLocation[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetchReusableLocations(projectId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setLocations(res.locations);
      setSelected([]);
    });
  }, [projectId]);

  useEffect(() => {
    if (autoOpen && locations === null) load();
  }, [autoOpen, load, locations]);

  const visible = (locations ?? []).filter((site) => {
    if (!search.trim()) return true;
    const haystack =
      `${site.name} ${site.address} ${site.city} ${site.externalRef ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const allVisibleSelected =
    visible.length > 0 && visible.every((site) => selected.includes(site.id));

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const confirm = () => {
    startTransition(async () => {
      const res = await reuseLocations(projectId, selected);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("added", { count: res.inserted }));
      setOpen(false);
      setLocations(null);
      setSelected([]);
      if (autoOpen) router.replace(`/projects/${projectId}`, { scroll: false });
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && locations === null) load();
        if (!next) {
          setSearch("");
          if (autoOpen) router.replace(`/projects/${projectId}`, { scroll: false });
        }
      }}
    >
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline">{t("trigger")}</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {locations === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : locations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search")}
              disabled={pending}
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("found", { count: visible.length })}</span>
              <button
                type="button"
                className="hover:text-primary"
                onClick={() =>
                  setSelected((current) => {
                    const visibleIds = new Set(visible.map((site) => site.id));
                    return allVisibleSelected
                      ? current.filter((id) => !visibleIds.has(id))
                      : [...new Set([...current, ...visibleIds])];
                  })
                }
              >
                {allVisibleSelected ? t("clearAll") : t("selectAll")}
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-xl border">
              {visible.map((site) => (
                <label
                  key={site.id}
                  className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-b-0 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(site.id)}
                    onChange={() => toggle(site.id)}
                    disabled={pending}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {site.name}
                      {site.externalRef ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {site.externalRef}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[site.address, site.city, site.state]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {site.projectName ? (
                      <p className="text-xs text-muted-foreground">
                        {t("fromProject", { project: site.projectName })}
                      </p>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>

            <Button
              onClick={confirm}
              disabled={pending || selected.length === 0}
            >
              {pending
                ? t("adding")
                : t("addSelected", { count: selected.length })}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
