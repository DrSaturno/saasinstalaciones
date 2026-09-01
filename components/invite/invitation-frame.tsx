import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import styles from "./invitation.module.css";

type InvitationFrameProps = {
  children: React.ReactNode;
  brand: string;
  visualEyebrow: string;
  visualTitle: string;
  visualBody: string;
  visualAlt: string;
  secureAccess: string;
};

export function InvitationFrame({
  children,
  brand,
  visualEyebrow,
  visualTitle,
  visualBody,
  visualAlt,
  secureAccess,
}: InvitationFrameProps) {
  return (
    <main className={styles.page}>
      <section className={styles.visual} aria-labelledby="invitation-visual-title">
        <Image
          className={styles.visualImage}
          src="/images/invitation-signup-hero.webp"
          alt={visualAlt}
          fill
          priority
          sizes="(max-width: 800px) 100vw, 56vw"
        />
        <div className={styles.visualVeil} aria-hidden />

        <div className={styles.visualCopy}>
          <span>{visualEyebrow}</span>
          <h2 id="invitation-visual-title">{visualTitle}</h2>
          <p>{visualBody}</p>
        </div>

        <div className={styles.securityBadge}>
          <ShieldCheck aria-hidden />
          <span>{secureAccess}</span>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formInner}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandGrid} aria-hidden>
              {Array.from({ length: 9 }, (_, index) => (
                <span key={index} />
              ))}
            </span>
            {brand}
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}
