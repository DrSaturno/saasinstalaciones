"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rateInstaller } from "@/lib/actions/ratings";
import { transitionOrder } from "@/lib/actions/orders";
import { StarRating } from "@/components/shared/star-rating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RatingDialogProps = {
  orderId: string;
  mode: "finalize" | "rate";
};

export function RatingDialog({ orderId, mode }: RatingDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setOpen(false);
    setStars(0);
    setComment("");
  };

  const submit = (includeRating: boolean) => {
    startTransition(async () => {
      let finalized = false;

      if (mode === "finalize") {
        const transition = await transitionOrder(orderId, "finalizada");
        if (transition.error) {
          toast.error(transition.error);
          return;
        }
        finalized = true;
      }

      if (includeRating) {
        const rating = await rateInstaller(orderId, stars, comment);
        if (rating.error) {
          toast.error(
            finalized
              ? `La orden se finalizó, pero no se guardó la calificación: ${rating.error}`
              : rating.error,
          );
          reset();
          router.refresh();
          return;
        }
      }

      toast.success(
        mode === "finalize"
          ? includeRating
            ? "Orden aprobada y calificación guardada"
            : "Orden aprobada"
          : "Calificación guardada",
      );
      reset();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : reset())}
    >
      <DialogTrigger asChild>
        <Button className="w-full justify-start">
          {mode === "finalize" ? "Aprobar y finalizar" : "Calificar instalador"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "finalize" ? "Aprobar el trabajo" : "Calificar el trabajo"}
          </DialogTitle>
          <DialogDescription>
            {mode === "finalize"
              ? "La orden quedará finalizada. Podés sumar una calificación ahora o hacerlo más tarde."
              : "Tu opinión alimenta la reputación del instalador en toda la plataforma."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Calificación</Label>
            <StarRating
              value={stars}
              onChange={setStars}
              disabled={pending}
              label="Elegir calificación"
            />
            <p className="text-xs text-muted-foreground">
              {stars > 0 ? `${stars} de 5 estrellas` : "Elegí de 1 a 5 estrellas"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`rating-comment-${orderId}`}>Comentario opcional</Label>
            <Textarea
              id={`rating-comment-${orderId}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={1000}
              disabled={pending}
              placeholder="Contá cómo fue el trabajo…"
              rows={4}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {mode === "finalize" ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => submit(false)}
              >
                Aprobar sin calificar
              </Button>
            ) : null}
            <Button
              disabled={pending || stars === 0}
              onClick={() => submit(true)}
            >
              {pending
                ? "Guardando…"
                : mode === "finalize"
                  ? "Aprobar y calificar"
                  : "Guardar calificación"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
