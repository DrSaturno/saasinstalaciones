import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <Badge variant="secondary" className="bg-accent text-accent-foreground">
        Beta privada
      </Badge>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        Cada punto de instalación, bajo control.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Instala Pro es la plataforma para empresas de gráfica de gran formato
        que gestionan proyectos masivos: miles de puntos, decenas de
        instaladores, un solo tablero.
      </p>
      <div className="flex items-center gap-3">
        <Button asChild size="lg">
          <Link href="/login">Ingresar</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="mailto:ventas@instalapro.com">Contactar ventas</a>
        </Button>
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        AR · BR — gestión de instalaciones en campo
      </p>
    </main>
  );
}
