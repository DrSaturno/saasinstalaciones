"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("RatingDialog");
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
              ? t("partialError", { error: rating.error })
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
            ? t("finalizedRated")
            : t("finalized")
          : t("rated"),
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
          {mode === "finalize" ? t("finalizeTrigger") : t("rateTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "finalize" ? t("finalizeTitle") : t("rateTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "finalize"
              ? t("finalizeDescription")
              : t("rateDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>{t("rating")}</Label>
            <StarRating
              value={stars}
              onChange={setStars}
              disabled={pending}
              label={t("choose")}
            />
            <p className="text-xs text-muted-foreground">
              {stars > 0 ? t("stars", { count: stars }) : t("chooseStars")}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`rating-comment-${orderId}`}>{t("comment")}</Label>
            <Textarea
              id={`rating-comment-${orderId}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={1000}
              disabled={pending}
              placeholder={t("commentPlaceholder")}
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
                {t("approveWithout")}
              </Button>
            ) : null}
            <Button
              disabled={pending || stars === 0}
              onClick={() => submit(true)}
            >
              {pending
                ? t("saving")
                : mode === "finalize"
                  ? t("approveAndRate")
                  : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
