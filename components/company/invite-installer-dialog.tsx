"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { inviteInstaller } from "@/lib/actions/team";
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

export function InviteInstallerDialog() {
  const t = useTranslations("InviteInstaller");
  const common = useTranslations("Common");
  const errors = useTranslations("Errors");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const res = await inviteInstaller(email);
      if (res.error || !res.token) {
        toast.error(res.error ?? errors("createInvitation"));
        return;
      }
      setLink(`${window.location.origin}/invite/${res.token}`);
      toast.success(t("created"));
      router.refresh();
    });
  };

  const close = () => {
    setOpen(false);
    setEmail("");
    setLink(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button>{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("readyTitle")}</DialogTitle>
              <DialogDescription>
                {t("readyDescription")}
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
            <Button onClick={close}>{common("done")}</Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {t("description")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="instalador@email.com"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
              <Button onClick={submit} disabled={pending}>
                {pending ? t("creating") : t("submit")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
