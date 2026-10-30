/**
 * Torta de avance del proyecto (bloque 6): terminadas vs. abiertas.
 *
 * SVG puro, sin librería de gráficos nueva — es una sola dona con dos
 * segmentos, no justifica una dependencia. El número que la alimenta es el
 * mismo `done`/`total` que ya calcula `buildProjectPerformance`
 * (`finalizadas ÷ (total − canceladas)`), nunca uno nuevo.
 */
export function OrderCompletionPie({
  done,
  total,
  doneLabel,
  openLabel,
}: {
  done: number;
  total: number;
  doneLabel: string;
  openLabel: string;
}) {
  const open = Math.max(0, total - done);
  const pct = total > 0 ? done / total : 0;

  const size = 96;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const doneLength = circumference * pct;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`${Math.round(pct * 100)}%`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {total > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--success)"
            strokeWidth={stroke}
            strokeDasharray={`${doneLength} ${circumference - doneLength}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground font-mono text-lg font-semibold"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--success)]" aria-hidden="true" />
          {doneLabel}: <span className="font-mono font-medium">{done}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted" aria-hidden="true" />
          {openLabel}: <span className="font-mono font-medium">{open}</span>
        </span>
      </div>
    </div>
  );
}
