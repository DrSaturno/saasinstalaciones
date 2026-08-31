import styles from "./marketing-page.module.css";

const ROUTE_PINS = [
  { cx: 42, cy: 143, tone: styles.routePinSand },
  { cx: 242, cy: 101, tone: styles.routePinBlue },
  { cx: 361, cy: 154, tone: styles.routePinBlue },
  { cx: 459, cy: 58, tone: styles.routePinViolet },
] as const;

export function RouteConstellation() {
  return (
    <div className={styles.routeConstellation} aria-hidden>
      <svg viewBox="0 0 500 210" role="presentation">
        <path d="M42 143 C113 222 162 48 242 101 S358 183 459 58" />
        <path d="M46 143 C110 89 159 166 242 101" className={styles.routeSoft} />
        {ROUTE_PINS.map(({ cx, cy, tone }) => (
          <g className={tone} key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="18" />
            <circle cx={cx} cy={cy} r="6" />
          </g>
        ))}
      </svg>
    </div>
  );
}
