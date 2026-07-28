export function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-3 shadow-premium ${
        highlight && value > 0 ? "border-primary/40 bg-primary-soft/20" : ""
      }`}
    >
      <p className="font-mono text-2xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
