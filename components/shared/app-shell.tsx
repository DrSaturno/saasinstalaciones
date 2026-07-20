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
  const navigation = nav.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className="shrink-0 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {item.label}
    </Link>
  ));

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 md:gap-6">
            <Link
              href="/"
              className="shrink-0 whitespace-nowrap font-mono text-sm font-medium"
            >
              Instala Pro
            </Link>
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {area}
            </span>
            <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
              {navigation}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-muted-foreground lg:inline">
              {userName}
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto border-t px-2 py-1.5 text-sm text-muted-foreground md:hidden sm:px-4">
          {navigation}
        </nav>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
