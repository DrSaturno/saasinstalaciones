import Image from "next/image";
import { FileText, Paperclip } from "lucide-react";
import type { OrderAttachmentView } from "@/lib/data/order-attachments";

type Props = {
  attachments: OrderAttachmentView[];
  title: string;
  openLabel: (name: string) => string;
};

function fileSize(bytes: number) {
  if (bytes < 1_024 * 1_024) return `${Math.ceil(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function OrderAttachments({ attachments, title, openLabel }: Props) {
  if (attachments.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Paperclip className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {attachments.map((attachment) => {
          const content = attachment.mimeType.startsWith("image/") && attachment.signedUrl ? (
            <Image
              src={attachment.signedUrl}
              alt=""
              width={480}
              height={240}
              unoptimized
              className="h-28 w-full rounded-lg border object-cover"
            />
          ) : (
            <div className="flex h-28 items-center justify-center rounded-lg border bg-muted/25">
              <FileText className="size-8 text-primary" aria-hidden="true" />
            </div>
          );

          return (
            <article key={attachment.id} className="min-w-0 rounded-xl border bg-background p-2.5">
              {attachment.signedUrl ? (
                <a
                  href={attachment.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={openLabel(attachment.fileName)}
                >
                  {content}
                </a>
              ) : (
                content
              )}
              <p className="mt-2 truncate text-xs font-medium">{attachment.fileName}</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {fileSize(attachment.sizeBytes)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

