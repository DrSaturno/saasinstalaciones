"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const res = await inviteInstaller(email);
      if (res.error || !res.token) {
        toast.error(res.error ?? "No se pudo crear la invitación");
        return;
      }
      setLink(`${window.location.origin}/invite/${res.token}`);
      toast.success("Invitación creada");
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
        <Button>Invitar instalador</Button>
      </DialogTrigger>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitación lista</DialogTitle>
              <DialogDescription>
                Compartí este link con el instalador. Al abrirlo e iniciar
                sesión, se une a tu equipo. Vence en 7 días.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="break-all font-mono text-xs">{link}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("Link copiado");
              }}
            >
              Copiar link
            </Button>
            <Button onClick={close}>Listo</Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invitar instalador</DialogTitle>
              <DialogDescription>
                Generamos un link de invitación para que se sume a tu equipo.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email del instalador</Label>
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
                {pending ? "Creando…" : "Crear invitación"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
