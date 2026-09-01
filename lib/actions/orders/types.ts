/**
 * Tipos compartidos por los casos de uso de órdenes.
 *
 * Vive aparte de `context.ts` a propósito: los componentes cliente importan
 * `ActionState` y `OrderFormSite`, y este archivo no arrastra nada de servidor.
 */

export type ActionState = { error: string | null; ok?: boolean };

export type CreateOrderResult = ActionState & {
  orderId?: string;
  companyId?: string;
  orderNumber?: string;
};

export type OrderFormSite = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zone: string;
  externalRef: string | null;
  /**
   * Su locación tiene algún permiso `pending`/`expired`/`rejected`. Sólo un
   * flag: el detalle se pide aparte con `getSiteRequirementsPreview`, recién
   * al elegir el sitio — no tiene sentido cargarlo para miles de sitios que
   * el usuario nunca va a mirar.
   */
  hasOpenRequirements: boolean;
};

export type OrderFormSitesResult = {
  error: string | null;
  sites: OrderFormSite[];
};

export type BulkResult = {
  error: string | null;
  created: number;
  skipped: number;
};
