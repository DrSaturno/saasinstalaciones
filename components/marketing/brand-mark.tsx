import Link from "next/link";
import styles from "./marketing-page.module.css";

export function BrandMark({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <Link
      className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}
      href="/"
      aria-label={label}
    >
      <span className={styles.brandGrid} aria-hidden>
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} />
        ))}
      </span>
      <span>{label}</span>
    </Link>
  );
}

