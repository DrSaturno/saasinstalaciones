import type { OrderStatus } from "@/types/database";

export type FinanceDemoOrder = {
  number: string;
  client: string;
  project: string;
  site: string;
  zone: "AMBA" | "Interior";
  work: "exampleWorkAmba" | "exampleWorkInterior" | "exampleWorkPending";
  team: string;
  suppliers: string[];
  status: OrderStatus;
  amount: number;
};

// Datos inventados para validar navegación y filtros sin conectar una base.
export const financeDemoOrders: FinanceDemoOrder[] = [
  { number: "OT-A-2601", client: "Tienda Faro", project: "Renovación de tiendas", site: "Sucursal Palermo",
    zone: "AMBA", work: "exampleWorkAmba", team: "Instalaciones Horizonte · Coordinación Delta",
    suppliers: ["Instalaciones Horizonte", "Coordinación Delta"], status: "finalizada", amount: 490000 },
  { number: "OT-I-2602", client: "Comercio Azul", project: "Expansión Interior", site: "Sucursal Rosario",
    zone: "Interior", work: "exampleWorkInterior", team: "Equipo Río Claro",
    suppliers: ["Equipo Río Claro"], status: "finalizada", amount: 680000 },
  { number: "OT-I-2603", client: "Centro Bosque", project: "Señalética sucursales", site: "Sucursal Mendoza",
    zone: "Interior", work: "exampleWorkPending", team: "Equipo Monte",
    suppliers: ["Equipo Monte"], status: "planificada", amount: 420000 },
  { number: "OT-A-2604", client: "Tienda Faro", project: "Renovación de tiendas", site: "Sucursal Belgrano",
    zone: "AMBA", work: "exampleWorkAmba", team: "Instalaciones Horizonte",
    suppliers: ["Instalaciones Horizonte"], status: "en_proceso", amount: 310000 },
  { number: "OT-I-2605", client: "Comercio Azul", project: "Expansión Interior", site: "Sucursal Córdoba",
    zone: "Interior", work: "exampleWorkInterior", team: "Equipo Río Claro",
    suppliers: ["Equipo Río Claro"], status: "en_revision", amount: 535000 },
  { number: "OT-A-2606", client: "Centro Bosque", project: "Señalética sucursales", site: "Sucursal Caballito",
    zone: "AMBA", work: "exampleWorkAmba", team: "Coordinación Delta",
    suppliers: ["Coordinación Delta"], status: "finalizada", amount: 265000 },
];
