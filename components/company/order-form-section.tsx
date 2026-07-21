import type { ReactNode } from "react";

type Props = {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function OrderFormSection({ number, title, description, children }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-start gap-3 border-b bg-muted/25 px-4 py-4 sm:px-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-[11px] font-semibold text-primary-foreground">
          {number}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

