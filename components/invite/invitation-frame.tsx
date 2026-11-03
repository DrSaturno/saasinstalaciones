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
  /** Pantallas de paso (elegir contraseña): la escena va arriba y más grande, sin repetir el título. */
  compact?: boolean;
};

export function InvitationFrame({
  children,
  brand,
  visualEyebrow,
  visualTitle,
  visualBody,
  visualAlt,
  secureAccess,
  compact = false,
}: InvitationFrameProps) {
  return (
    <main className={compact ? `${styles.page} ${styles.compact}` : styles.page}>
      <section className={styles.visual} aria-labelledby="invitation-visual-title">
        <div className={styles.visualCopy}>
          <span>{visualEyebrow}</span>
          <h2 id="invitation-visual-title">{visualTitle}</h2>
          <p>{visualBody}</p>
        </div>

        {/* La escena va DEBAJO del texto, no detrás: en pantallas anchas el
            recorte dejaba al instalador justo debajo del párrafo. */}
        <div className={styles.visualScene}>
          <Image
            className={styles.sceneImage}
            src="/images/invitation-signup-scene.webp"
            alt={visualAlt}
            width={1080}
            height={880}
            priority
            sizes="(max-width: 800px) 100vw, 56vw"
          />
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
