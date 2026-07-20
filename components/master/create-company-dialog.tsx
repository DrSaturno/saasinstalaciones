"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CreateResult = { company: { id: string; name: string }; tempPassword: string };

export function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<"AR" | "BR">("AR");
  const [created, setCreated] = useState<
    (CreateResult & { managerEmail: string }) | null
  >(null);
  const queryClient = useQueryClient();

  const createCompany = useMutation({
    mutationFn: async (formData: FormData) => {
      const payload = {
        name: String(formData.get("name") ?? ""),
        country,
        orderPrefix: String(formData.get("orderPrefix") ?? "ORD").toUpperCase(),
        managerEmail: String(formData.get("managerEmail") ?? ""),
        managerName: String(formData.get("managerName") ?? ""),
      };
      const res = await fetch("/api/master/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo crear la empresa");
      return { ...(body as CreateResult), managerEmail: payload.managerEmail };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["master"] });
      setCreated(result);
      toast.success(`Empresa "${result.company.name}" creada`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = () => {
    setOpen(false);
    setCreated(null);
    setCountry("AR");
    createCompany.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button>Nueva empresa</Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Empresa creada</DialogTitle>
              <DialogDescription>
                Compartí estas credenciales con el responsable. La contraseña se
                muestra una sola vez.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-mono text-sm">{created.managerEmail}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Contraseña temporal
              </p>
              <p className="font-mono text-sm">{created.tempPassword}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Email: ${created.managerEmail}\nContraseña: ${created.tempPassword}`,
                );
                toast.success("Credenciales copiadas");
              }}
            >
              Copiar credenciales
            </Button>
            <Button onClick={close}>Listo</Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nueva empresa</DialogTitle>
              <DialogDescription>
                Se crea la empresa y el usuario de su responsable de proyecto.
              </DialogDescription>
            </DialogHeader>
            <form
              action={(formData) => createCompany.mutate(formData)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Razón social</Label>
                <Input id="name" name="name" placeholder="Alltak Brasil Ltda." required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="country">País</Label>
                  <Select
                    value={country}
                    onValueChange={(v) => setCountry(v as "AR" | "BR")}
                  >
                    <SelectTrigger id="country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AR">Argentina</SelectItem>
                      <SelectItem value="BR">Brasil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="orderPrefix">Prefijo de órdenes</Label>
                  <Input
                    id="orderPrefix"
                    name="orderPrefix"
                    placeholder="ALL"
                    defaultValue="ORD"
                    maxLength={5}
                    className="font-mono uppercase"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="managerName">Responsable</Label>
                <Input id="managerName" name="managerName" placeholder="Nombre y apellido" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="managerEmail">Email del responsable</Label>
                <Input
                  id="managerEmail"
                  name="managerEmail"
                  type="email"
                  placeholder="responsable@empresa.com"
                  required
                />
              </div>
              <Button type="submit" disabled={createCompany.isPending} className="mt-2">
                {createCompany.isPending ? "Creando…" : "Crear empresa"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
