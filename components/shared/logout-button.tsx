"use client";

import { useTransition, type FormEvent } from "react";
import { logoutAction } from "@/lib/actions/session";
import { clearOfflineSession } from "@/lib/offline/session-storage";
import { Button } from "@/components/ui/button";

export function LogoutButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      // El logout del server corre aunque un navegador niegue algún borrado.
      await clearOfflineSession();
      await logoutAction();
    });
  };

  return (
    <form action={logoutAction} onSubmit={submit}>
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
