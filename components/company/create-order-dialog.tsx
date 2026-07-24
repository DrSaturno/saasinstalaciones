"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createOrder,
  registerOrderAttachments,
} from "@/lib/actions/orders";
import {
  isAcceptedOrderFile,
  MAX_ORDER_ATTACHMENTS,
  type OrderAttachmentRegistration,
} from "@/lib/domain/order-intake";
import type { OrderFormProject } from "@/lib/data/order-form";
import { createClient } from "@/lib/supabase/client";
import type { OrderCurrency } from "@/types/database";
import { OrderFormFields } from "@/components/company/order-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type RosterOption = {
  id: string;
  name: string;
  ratingAvg: number;
  ratingCount: number;
};

type Props = {
  projects: OrderFormProject[];
  roster: RosterOption[];
  currency: OrderCurrency;
  trigger?: React.ReactNode;
  canManageFinance?: boolean;
};

function safeExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const cleaned = fromName.replace(/[^a-z0-9]/g, "").slice(0, 10);
  if (cleaned) return cleaned;
  if (file.type === "application/pdf") return "pdf";
  return file.type.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 10) || "file";
}

export function CreateOrderDialog({ projects, roster, currency, trigger, canManageFinance = true }: Props) {
  const t = useTranslations("CreateOrder");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();

  const changeOpen = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (!next) setFiles([]);
  };

  const addFiles = (incoming: File[]) => {
    const accepted = incoming.filter(isAcceptedOrderFile);
    const rejected = incoming.length - accepted.length;
    if (rejected > 0) toast.error(t("files.invalid", { count: rejected }));
    setFiles((current) => {
      const room = Math.max(0, MAX_ORDER_ATTACHMENTS - current.length);
      if (accepted.length > room) toast.error(t("files.limit", { count: MAX_ORDER_ATTACHMENTS }));
      return [...current, ...accepted.slice(0, room)];
    });
  };

  const uploadFiles = async (companyId: string, orderId: string) => {
    const supabase = createClient();
    const results = await Promise.all(
      files.map(async (file): Promise<OrderAttachmentRegistration | null> => {
        const storagePath = `${companyId}/${orderId}/brief-${crypto.randomUUID()}.${safeExtension(file)}`;
        const { error } = await supabase.storage.from("evidence").upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
        if (error) return null;
        return {
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        };
      }),
    );
    const uploaded = results.filter(
      (item): item is OrderAttachmentRegistration => item !== null,
    );
    if (uploaded.length === 0) return { uploaded: 0, failed: files.length };

    const registration = await registerOrderAttachments(orderId, uploaded);
    if (registration.error) {
      await supabase.storage
        .from("evidence")
        .remove(uploaded.map((item) => item.storagePath));
      return { uploaded: 0, failed: files.length };
    }
    return { uploaded: uploaded.length, failed: files.length - uploaded.length };
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createOrder({ error: null }, formData);
      if (result.error || !result.orderId || !result.companyId) {
        toast.error(result.error ?? t("unknownError"));
        return;
      }

      const fileResult =
        files.length > 0
          ? await uploadFiles(result.companyId, result.orderId)
          : { uploaded: 0, failed: 0 };
      if (fileResult.failed > 0) {
        toast.warning(
          t("partialFiles", {
            uploaded: fileResult.uploaded,
            failed: fileResult.failed,
          }),
        );
      } else {
        toast.success(t("success", { number: result.orderNumber ?? "" }));
      }
      setOpen(false);
      setFiles([]);
      router.push(`/orders/${result.orderId}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button disabled={projects.length === 0}>
          <Plus className="size-4" aria-hidden="true" />
          {t("trigger")}
        </Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader className="border-b px-5 py-4 pr-12 sm:px-6 sm:py-5">
            <div className="flex items-center gap-3">
              <span className="hidden rounded-lg bg-primary-soft px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary sm:inline">
                {t("eyebrow")}
              </span>
              <DialogTitle>{t("title")}</DialogTitle>
            </div>
            <DialogDescription>{t("subtitle")}</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto overscroll-contain p-4 sm:p-6">
            <OrderFormFields
              projects={projects}
              roster={roster}
              currency={currency}
              files={files}
              disabled={pending}
              onAddFiles={addFiles}
              onRemoveFile={(index) =>
                setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
              canManageFinance={canManageFinance}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur-sm sm:flex-row sm:justify-end sm:px-6 sm:py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} className="sm:min-w-44">
              {pending ? t("creating") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
