import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getMessages, getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";
import loginMessageShape from "@/messages/login/es.json";

type LoginMessages = typeof loginMessageShape;

export default async function LoginPage() {
  const [t, messages] = await Promise.all([
    getTranslations("Login"),
    getMessages(),
  ]);
  const login = messages.Login as typeof messages.Login & LoginMessages;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.story} aria-labelledby="login-story-title">
          <Image
            className={styles.canvasImage}
            src="/images/login-operations-canvas.webp"
            alt={login.visualAlt}
            fill
            priority
            sizes="(max-width: 800px) calc(100vw - 32px), (max-width: 1200px) 54vw, 810px"
          />
          <div className={styles.canvasVeil} aria-hidden />

          <div className={styles.storyCopy}>
            <span className={styles.eyebrow}>{login.eyebrow}</span>
            <h1 id="login-story-title">{login.heroTitle}</h1>
            <p>{login.heroBody}</p>
          </div>

          <div className={styles.securityBadge}>
            <ShieldCheck aria-hidden />
            <span>{login.secureAccess}</span>
          </div>
        </section>

        <section className={styles.formPanel} aria-labelledby="login-form-title">
          <div className={styles.formInner}>
            <div className={styles.formHeading}>
              <span>{login.formEyebrow}</span>
              <h2 id="login-form-title">{t("title")}</h2>
              <p>{login.formDescription}</p>
            </div>

            <Suspense fallback={null}>
              <LoginForm
                showPasswordLabel={login.showPassword}
                hidePasswordLabel={login.hidePassword}
              />
            </Suspense>

            <Link className={styles.backHome} href="/">
              <ArrowLeft aria-hidden />
              {login.backHome}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
