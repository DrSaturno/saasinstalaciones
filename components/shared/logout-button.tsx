"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { logoutAction } from "@/lib/actions/session";
import { clearOfflineSession } from "@/lib/offline/session-storage";
import { pendingOfflineWork } from "@/lib/offline/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LogoutButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const t = useTranslations("OfflineLogout");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [work, setWork] = useState({ operations: 0, photos: 0 });
  const [error, setError] = useState<string | null>(null);

  const leave = (discard = false, synchronize = false) => startTransition(async () => {
    setError(null);
    let cleaned = false;
    try {
      if (synchronize) {
        const { flush } = await import("@/lib/offline/sync");
        await flush();
      }
      const remaining = await pendingOfflineWork();
      setWork(remaining);
      if (!discard && (remaining.operations > 0 || remaining.photos > 0)) {
        setOpen(true);
        if (synchronize) setError(t("stillPending"));
        return;
      }
      // Recheck in the database write transaction before removing local work.
      cleaned = await clearOfflineSession(undefined, discard);
    } catch {
      setError(t("checkFailed"));
      setOpen(true);
      return;
    }
    if (!cleaned) {
      setError(t("checkFailed"));
      setOpen(true);
      return;
    }
    await logoutAction();
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        disabled={pending}
        onClick={() => leave()}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", work)}</DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-wrap">
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t("stay")}</Button>
            <Button disabled={pending} onClick={() => leave(false, true)}>{t("sync")}</Button>
            <Button variant="destructive" disabled={pending} onClick={() => leave(true)}>{t("discard")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
