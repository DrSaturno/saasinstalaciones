"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteSiteAttachment, registerSiteAttachments } from "@/lib/actions/site-attachments";
import { isAcceptedOrderFile, MAX_ORDER_ATTACHMENTS, type OrderAttachmentRegistration } from "@/lib/domain/order-intake";
import type { SiteAttachmentView } from "@/lib/data/site-attachments";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function extension(file: File) {
  const value = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  return value || (file.type === "application/pdf" ? "pdf" : "file");
}

function fileSize(bytes: number) {
  return bytes < 1_048_576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function SiteFiles({ companyId, siteId, initial }: { companyId: string; siteId: string; initial: SiteAttachmentView[] }) {
  const t = useTranslations("SiteFiles");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState(initial);
  const [pending, startTransition] = useTransition();

  const upload = (files: File[]) => startTransition(async () => {
    const accepted = files.filter(isAcceptedOrderFile).slice(0, Math.max(0, MAX_ORDER_ATTACHMENTS - attachments.length));
    if (accepted.length !== files.length) toast.error(t("invalid"));
    if (!accepted.length) return;
    const supabase = createClient();
    const uploaded = (await Promise.all(accepted.map(async (file): Promise<OrderAttachmentRegistration | null> => {
      const storagePath = `${companyId}/${siteId}/site-${crypto.randomUUID()}.${extension(file)}`;
      const { error } = await supabase.storage.from("evidence").upload(storagePath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      return error ? null : { storagePath, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
    }))).filter((item): item is OrderAttachmentRegistration => item !== null);
    if (!uploaded.length) { toast.error(t("uploadError")); return; }
    const result = await registerSiteAttachments(siteId, uploaded);
    if (result.error) {
      await supabase.storage.from("evidence").remove(uploaded.map((item) => item.storagePath));
      toast.error(result.error);
      return;
    }
    toast.success(t("uploaded", { count: uploaded.length }));
    router.refresh();
  });

  const remove = (id: string) => startTransition(async () => {
    if (!window.confirm(t("deleteConfirm"))) return;
    const result = await deleteSiteAttachment(siteId, id);
    if (result.error) { toast.error(result.error); return; }
    setAttachments((current) => current.filter((item) => item.id !== id));
    toast.success(t("deleted"));
    router.refresh();
  });

  return (
    <Card>
      <CardHeader className="border-b"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Paperclip className="size-4 text-primary" aria-hidden="true" />{t("title")}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{t("description")}</p></div><Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} disabled={pending || attachments.length >= MAX_ORDER_ATTACHMENTS}><Plus className="size-4" aria-hidden="true" />{t("add")}</Button></div></CardHeader>
      <CardContent>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(event) => { upload(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        {attachments.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{attachments.map((attachment) => <article key={attachment.id} className="group relative overflow-hidden rounded-xl border bg-background p-2.5">{attachment.mimeType.startsWith("image/") && attachment.signedUrl ? <a href={attachment.signedUrl} target="_blank" rel="noreferrer"><Image src={attachment.signedUrl} alt={attachment.fileName} width={480} height={240} unoptimized className="h-32 w-full rounded-lg object-cover" /></a> : <a href={attachment.signedUrl ?? "#"} target="_blank" rel="noreferrer" className="flex h-32 items-center justify-center rounded-lg bg-muted/40"><FileText className="size-9 text-primary" aria-hidden="true" /></a>}<div className="mt-2 flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-medium">{attachment.fileName}</p><p className="font-mono text-[10px] text-muted-foreground">{fileSize(attachment.sizeBytes)}</p></div><Button type="button" size="icon-sm" variant="ghost" aria-label={t("delete", { name: attachment.fileName })} onClick={() => remove(attachment.id)} disabled={pending}><Trash2 className="size-3.5" /></Button></div></article>)}</div>}
      </CardContent>
    </Card>
  );
}
