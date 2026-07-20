import Link from "next/link";
import { logoutAction } from "@/lib/actions/session";
import { Button } from "@/components/ui/button";

export type NavItem = { href: string; label: string };

/**
 * Shell básico compartido: barra superior con marca, navegación y logout.
 * Cada área pasa sus propios items. La navegación densa/lateral llega en
 * pasos posteriores; por ahora es el esqueleto guardado por rol.
 */
export function AppShell({
  area,
  nav,
  userName,
  children,
}: {
  area: string;
  nav: NavItem[];
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono text-sm font-medium">
            Instala Pro
          </Link>
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
            {area}
          </span>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{userName}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
