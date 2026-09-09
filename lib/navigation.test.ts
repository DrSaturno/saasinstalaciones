import { describe, expect, it } from "vitest";
import { companyNav, installerNav } from "@/lib/navigation";

// El menú se arma con las claves de traducción como etiqueta: acá sólo
// importan los destinos y su orden, no el texto.
const t = ((key: string) => key) as unknown as Parameters<typeof companyNav>[0];

const hrefs = (items: { href: string }[]) => items.map((item) => item.href);

describe("companyNav", () => {
  it("incluye agenda y configuración, que se habían perdido entrando por Mensajería", () => {
    const nav = hrefs(companyNav(t, { needsLocationReview: false }));
    expect(nav).toContain("/agenda");
    expect(nav).toContain("/settings");
  });

  it("muestra la revisión de locaciones sólo mientras quede algo por decidir", () => {
    expect(hrefs(companyNav(t, { needsLocationReview: false }))).not.toContain("/locations/review");
    expect(hrefs(companyNav(t, { needsLocationReview: true }))).toContain("/locations/review");
  });

  it("deja configuración al final, incluso con la revisión intercalada", () => {
    const nav = hrefs(companyNav(t, { needsLocationReview: true }));
    expect(nav.at(-1)).toBe("/settings");
  });
});

describe("installerNav", () => {
  it("incluye agenda y ganancias, que se habían perdido entrando por Mensajería", () => {
    const nav = hrefs(installerNav(t, { isCoordinator: false }));
    expect(nav).toContain("/schedule");
    expect(nav).toContain("/earnings");
  });

  it("suma coordinación sólo a quien coordina algún equipo", () => {
    expect(hrefs(installerNav(t, { isCoordinator: false }))).not.toContain("/coordination");
    expect(hrefs(installerNav(t, { isCoordinator: true }))).toContain("/coordination");
  });
});
