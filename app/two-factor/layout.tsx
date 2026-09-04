import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Área de verificación en dos pasos. Vive FUERA de los layouts de rol
 * ((company)/(master)) a propósito: esos exigen AAL2, así que enrolar o
 * verificar acá adentro sería un loop. Sólo pide sesión iniciada.
 */
export default async function TwoFactorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      {children}
    </main>
  );
}
