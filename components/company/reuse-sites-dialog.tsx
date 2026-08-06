"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { fetchReusableSites, reuseSites } from "@/lib/actions/projects/reuse";
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

type ReusableSite = {
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
export function ReuseSitesDialog({ projectId }: { projectId: string }) {
  const t = useTranslations("ReuseSites");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<ReusableSite[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const res = await fetchReusableSites(projectId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSites(res.sites);
      setSelected([]);
    });
  };

  const visible = (sites ?? []).filter((site) => {
    if (!search.trim()) return true;
    const haystack =
      `${site.name} ${site.address} ${site.city} ${site.externalRef ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const confirm = () => {
    startTransition(async () => {
      const res = await reuseSites(projectId, selected);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("added", { count: res.inserted }));
      setOpen(false);
      setSites(null);
      setSelected([]);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && sites === null) load();
        if (!next) setSearch("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {sites === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : sites.length === 0 ? (
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
                  setSelected(
                    selected.length === visible.length
                      ? []
                      : visible.map((site) => site.id),
                  )
                }
              >
                {selected.length === visible.length ? t("clearAll") : t("selectAll")}
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
                    <p className="text-xs text-muted-foreground">
                      {t("fromProject", { project: site.projectName })}
                    </p>
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
