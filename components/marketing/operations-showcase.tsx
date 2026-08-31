import { Camera, CircleCheck, MapPin } from "lucide-react";
import styles from "./marketing-page.module.css";

export function OperationsShowcase({
  title,
  states,
  evidence,
  location,
}: {
  title: string;
  states: string;
  evidence: string;
  location: string;
}) {
  return (
    <div className={styles.showcase}>
      <div className={styles.dashboardMockup} aria-hidden>
        <div className={styles.dashboardRail}>
          <span className={styles.railLogo} />
          {Array.from({ length: 6 }, (_, index) => (
            <span className={index === 1 ? styles.railActive : ""} key={index} />
          ))}
        </div>
        <div className={styles.dashboardBody}>
          <div className={styles.metricRow}>
            {Array.from({ length: 4 }, (_, index) => (
              <div className={styles.metricCard} key={index}>
                <span />
                <i />
              </div>
            ))}
          </div>
          <div className={styles.dashboardMain}>
            <div className={styles.mapPanel}>
              <svg viewBox="0 0 360 190" preserveAspectRatio="none">
                <path d="M22 145 C70 100 68 48 128 64 S210 150 248 93 S315 26 345 50" />
                <path d="M18 52 C62 71 88 154 151 130 S240 36 340 143" />
              </svg>
              {[
                [14, 68],
                [29, 30],
                [38, 62],
                [52, 38],
                [63, 70],
                [72, 22],
                [84, 55],
              ].map(([left, top], index) => (
                <span
                  className={index === 4 ? styles.mapPinAccent : styles.mapPin}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  key={`${left}-${top}`}
                />
              ))}
            </div>
            <div className={styles.statusPanel}>
              {Array.from({ length: 5 }, (_, index) => (
                <div className={styles.statusRow} key={index}>
                  <span className={styles.statusDot} />
                  <div>
                    <i />
                    <b />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.tableRows}>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index}>
                <span />
                <i />
                <i />
                <b />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.showcaseCopy}>
        <h2>{title}</h2>
        <ul>
          <li>
            <span className={styles.showcaseIconGreen} aria-hidden>
              <CircleCheck />
            </span>
            {states}
          </li>
          <li>
            <span className={styles.showcaseIconViolet} aria-hidden>
              <Camera />
            </span>
            {evidence}
          </li>
          <li>
            <span className={styles.showcaseIconBlue} aria-hidden>
              <MapPin />
            </span>
            {location}
          </li>
        </ul>
      </div>
    </div>
  );
}

