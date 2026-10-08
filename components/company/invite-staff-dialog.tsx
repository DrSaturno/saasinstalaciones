"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { inviteCompanyStaff } from "@/lib/actions/company-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Invitar una subcuenta (SUBCTA-*): calco de `InviteInstallerDialog`, con el
 * permiso ya decidido en la propia invitación (SUBCTA-R3.3) en vez de un
 * selector de rol.
 */
export function InviteStaffDialog() {
  const t = useTranslations("InviteStaff");
  const errors = useTranslations("Errors");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [canManageFinance, setCanManageFinance] = useState(false);
  const [canManageSettings, setCanManageSettings] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const res = await inviteCompanyStaff(email, { canManageFinance, canManageSettings });
      if (res.error || !res.token) {
        toast.error(res.error ?? errors("createInvitation"));
        return;
      }
      setLink(`${window.location.origin}/invite/${res.token}`);
      setEmailSent(res.emailStatus === "sent");
      if (res.emailStatus === "sent") toast.success(t("sent"));
      else if (res.emailStatus === "failed") toast.warning(t("emailFailed"));
      else toast.success(t("created"));
      router.refresh();
    });
  };

  const close = () => {
    setOpen(false);
    setEmail("");
    setCanManageFinance(false);
    setCanManageSettings(false);
    setLink(null);
    setEmailSent(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("readyTitle")}</DialogTitle>
              <DialogDescription>
                {emailSent ? t("sentDescription", { email }) : t("readyDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="break-all font-mono text-xs">{link}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success(t("copied"));
              }}
            >
              {t("copy")}
            </Button>
            <Button onClick={close}>{t("close")}</Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-email">{t("email")}</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="flex flex-col gap-3 rounded-xl border p-3">
                <p className="text-xs font-medium text-muted-foreground">{t("permissionsTitle")}</p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={canManageFinance}
                    onChange={(event) => setCanManageFinance(event.target.checked)}
                    disabled={pending}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">{t("financeLabel")}</span>
                    <span className="block text-xs text-muted-foreground">{t("financeHint")}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={canManageSettings}
                    onChange={(event) => setCanManageSettings(event.target.checked)}
                    disabled={pending}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">{t("settingsLabel")}</span>
                    <span className="block text-xs text-muted-foreground">{t("settingsHint")}</span>
                  </span>
                </label>
              </div>
              <Button onClick={submit} disabled={pending || !email}>
                {pending ? t("creating") : t("submit")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
