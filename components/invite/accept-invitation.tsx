"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { acceptInvitation } from "@/lib/actions/invitations";
import { Button } from "@/components/ui/button";

export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations("Invitation");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const accept = () => {
    startTransition(async () => {
      const res = await acceptInvitation(token);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setDone(true);
      toast.success(t("joinedToast"));
      // Damos un momento para leer el mensaje antes de ir a las tareas.
      setTimeout(() => router.push("/tasks"), 1200);
    });
  };

  if (done) {
    return (
      <p className="text-sm text-[var(--success)]">
        {t("joined")}
      </p>
    );
  }

  return (
    <Button onClick={accept} disabled={pending} className="w-full">
      {pending ? t("joining") : t("join")}
    </Button>
  );
}
