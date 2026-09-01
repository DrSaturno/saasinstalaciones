import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLocationProjectHistory,
  type LocationProjectHistory,
} from "@/lib/domain/location-detail";
import type { Database, Tables } from "@/types/database";

export type CanonicalLocation = Pick<
  Tables<"locations">,
  | "id"
  | "company_id"
  | "client_id"
  | "external_ref"
  | "name"
  | "address"
  | "city"
  | "state"
  | "zone"
  | "country"
  | "lat"
  | "lng"
  | "contact_name"
  | "contact_phone"
  | "contact_email"
  | "opening_hours"
  | "access_notes"
  | "parking_notes"
  | "technical_notes"
  | "risk_notes"
  | "permanent_notes"
  | "source"
  | "archived_at"
  | "created_at"
  | "updated_at"
>;

export type LocationRequirementView = Pick<
  Tables<"location_requirements">,
  | "id"
  | "kind"
  | "requirement_type"
  | "status"
  | "valid_from"
  | "expires_on"
  | "notes"
  | "document_attachment_id"
  | "created_at"
> & {
  responsibleName: string | null;
  documentName: string | null;
};

export type LocationDocumentView = {
  id: string;
  source: "canonical" | "legacy";
  storagePath: string;
  signedUrl: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  description: string;
  createdAt: string;
};

export type LocationEvidenceView = {
  key: string;
  origin: "order_attachment" | "order_update";
  storagePath: string;
  signedUrl: string | null;
  fileName: string;
  isImage: boolean;
  orderId: string;
  orderNumber: string;
  projectName: string;
  createdAt: string;
  note: string;
  updateType: string | null;
};

export type LocationIncidentView = Pick<
  Tables<"order_incidents">,
  | "id"
  | "category"
  | "severity"
  | "description"
  | "requires_revisit"
  | "status"
  | "occurred_at"
  | "created_at"
> & {
  orderId: string;
  orderNumber: string;
  projectName: string;
};

export type LocationEventView = Pick<
  Tables<"location_change_events">,
  | "id"
  | "actor_context"
  | "event_type"
  | "status"
  | "changed_fields"
  | "note"
  | "client_created_at"
  | "created_at"
> & {
  actorName: string | null;
};

export type CanonicalLocationDetail = {
  location: CanonicalLocation;
  client: { id: string; name: string } | null;
  projects: LocationProjectHistory[];
  requirements: LocationRequirementView[];
  documents: LocationDocumentView[];
  evidence: LocationEvidenceView[];
  incidents: LocationIncidentView[];
  events: LocationEventView[];
  summary: {
    projectCount: number;
    orderCount: number;
    completedOrderCount: number;
    evidenceCount: number;
    incidentCount: number;
    openIncidentCount: number;
  };
  editContext: {
    projectId: string;
    siteId: string;
    country: Tables<"projects">["country"];
    zones: string[];
  } | null;
};

function photoPaths(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Ficha transversal de una locacion canonica (R2-UI-01).
 *
 * Las tablas permanentes se leen directamente. OTs, incidentes, evidencia y
 * documentos legacy se alcanzan solo mediante `sites.location_id`; no se usa
 * el emparejamiento heuristico por nombre/direccion que existia antes del
 * modelo canonico.
 */
export async function fetchCanonicalLocationDetail(
  supabase: SupabaseClient<Database>,
  locationId: string,
): Promise<CanonicalLocationDetail | null> {
  const [
    { data: location, error: locationError },
    { data: associations },
    { data: requirements },
    { data: canonicalDocuments },
    { data: events },
    { data: sites },
  ] = await Promise.all([
    supabase
      .from("locations")
      .select(
        "id, company_id, client_id, external_ref, name, address, city, state, zone, country, lat, lng, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes, source, archived_at, created_at, updated_at, clients!locations_client_company_fk(id, name)",
      )
      .eq("id", locationId)
      .single(),
    supabase
      .from("project_locations")
      .select("id, project_id, status, scope, unit_quantity, created_at")
      .eq("location_id", locationId),
    supabase
      .from("location_requirements")
      .select(
        "id, kind, requirement_type, status, valid_from, expires_on, responsible_user_id, notes, document_attachment_id, created_at",
      )
      .eq("location_id", locationId)
      .order("expires_on", { ascending: true, nullsFirst: false }),
    supabase
      .from("location_attachments")
      .select(
        "id, storage_path, file_name, mime_type, size_bytes, category, description, created_at",
      )
      .eq("location_id", locationId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("location_change_events")
      .select(
        "id, actor_id, actor_context, event_type, status, changed_fields, note, client_created_at, created_at",
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("sites")
      .select("id, project_id")
      .eq("location_id", locationId),
  ]);

  if (locationError || !location) return null;

  const associationRows = associations ?? [];
  const requirementRows = requirements ?? [];
  const eventRows = events ?? [];
  const siteRows = sites ?? [];
  const projectIds = [
    ...new Set([
      ...associationRows.map((row) => row.project_id),
      ...siteRows.map((row) => row.project_id),
    ]),
  ];
  const siteIds = siteRows.map((row) => row.id);
  const profileIds = [
    ...new Set(
      [
        ...requirementRows.map((row) => row.responsible_user_id),
        ...eventRows.map((row) => row.actor_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const fetchProjects = async () => {
    if (projectIds.length === 0) return [];
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, starts_at, ends_at, archived_at, country, zones")
      .in("id", projectIds);
    return data ?? [];
  };
  const fetchOrders = async () => {
    if (siteIds.length === 0) return [];
    const { data } = await supabase
      .from("work_orders")
      .select(
        "id, site_id, project_id, order_number, title, status, scheduled_date, finalized_at, created_at, assigned_installer_id",
      )
      .in("site_id", siteIds)
      .order("created_at", { ascending: false });
    return data ?? [];
  };
  const fetchLegacyDocuments = async () => {
    if (siteIds.length === 0) return [];
    const { data } = await supabase
      .from("site_attachments")
      .select(
        "id, storage_path, file_name, mime_type, size_bytes, created_at",
      )
      .in("site_id", siteIds)
      .order("created_at", { ascending: false });
    return data ?? [];
  };
  const fetchProfiles = async () => {
    if (profileIds.length === 0) return [];
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    return data ?? [];
  };

  const [projects, orders, legacyDocuments, profiles] = await Promise.all([
    fetchProjects(),
    fetchOrders(),
    fetchLegacyDocuments(),
    fetchProfiles(),
  ]);
  const orderIds = orders.map((order) => order.id);
  const orderInstallerIds = [
    ...new Set(
      orders
        .map((order) => order.assigned_installer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const fetchInstallerProfiles = async () => {
    if (orderInstallerIds.length === 0) return [];
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", orderInstallerIds);
    return data ?? [];
  };
  const fetchIncidents = async () => {
    if (orderIds.length === 0) return [];
    const { data } = await supabase
      .from("order_incidents")
      .select(
        "id, order_id, category, severity, description, requires_revisit, status, occurred_at, created_at",
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });
    return data ?? [];
  };
  const fetchOrderAttachments = async () => {
    if (orderIds.length === 0) return [];
    const { data } = await supabase
      .from("order_attachments")
      .select(
        "id, order_id, storage_path, file_name, mime_type, created_at",
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });
    return data ?? [];
  };
  const fetchOrderUpdates = async () => {
    if (orderIds.length === 0) return [];
    const { data } = await supabase
      .from("order_updates")
      .select("id, order_id, type, note, photos, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });
    return data ?? [];
  };

  const [incidents, orderAttachments, orderUpdates, installerProfiles] =
    await Promise.all([
      fetchIncidents(),
      fetchOrderAttachments(),
      fetchOrderUpdates(),
      fetchInstallerProfiles(),
    ]);
  const installerName = new Map(
    installerProfiles.map((profile) => [profile.id, profile.full_name]),
  );

  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const profileName = new Map(profiles.map((profile) => [profile.id, profile.full_name]));

  const documentByPath = new Map<
    string,
    Omit<LocationDocumentView, "signedUrl">
  >();
  for (const document of canonicalDocuments ?? []) {
    documentByPath.set(document.storage_path, {
      id: document.id,
      source: "canonical",
      storagePath: document.storage_path,
      fileName: document.file_name,
      mimeType: document.mime_type,
      sizeBytes: document.size_bytes,
      category: document.category,
      description: document.description,
      createdAt: document.created_at,
    });
  }
  for (const document of legacyDocuments) {
    if (documentByPath.has(document.storage_path)) continue;
    documentByPath.set(document.storage_path, {
      id: document.id,
      source: "legacy",
      storagePath: document.storage_path,
      fileName: document.file_name,
      mimeType: document.mime_type,
      sizeBytes: document.size_bytes,
      category: "general",
      description: "",
      createdAt: document.created_at,
    });
  }

  const rawEvidence: Omit<LocationEvidenceView, "signedUrl">[] = [];
  for (const attachment of orderAttachments) {
    const order = orderById.get(attachment.order_id);
    if (!order) continue;
    rawEvidence.push({
      key: `attachment-${attachment.id}`,
      origin: "order_attachment",
      storagePath: attachment.storage_path,
      fileName: attachment.file_name,
      isImage: attachment.mime_type.startsWith("image/"),
      orderId: order.id,
      orderNumber: order.order_number,
      projectName: projectName.get(order.project_id) ?? "",
      createdAt: attachment.created_at,
      note: "",
      updateType: null,
    });
  }
  for (const update of orderUpdates) {
    const order = orderById.get(update.order_id);
    if (!order) continue;
    photoPaths(update.photos).forEach((path, index) => {
      rawEvidence.push({
        key: `update-${update.id}-${index}`,
        origin: "order_update",
        storagePath: path,
        fileName: path.split("/").pop() ?? path,
        isImage: true,
        orderId: order.id,
        orderNumber: order.order_number,
        projectName: projectName.get(order.project_id) ?? "",
        createdAt: update.created_at,
        note: update.note,
        updateType: update.type,
      });
    });
  }

  const storagePaths = [
    ...new Set([
      ...documentByPath.keys(),
      ...rawEvidence.map((item) => item.storagePath),
    ]),
  ];
  const { data: signed } = storagePaths.length
    ? await supabase.storage
        .from("evidence")
        .createSignedUrls(storagePaths, 60 * 30)
    : { data: [] };
  const urlByPath = new Map(
    (signed ?? []).map((item) => [item.path, item.signedUrl ?? null]),
  );

  const documents = [...documentByPath.values()]
    .map((document) => ({
      ...document,
      signedUrl: urlByPath.get(document.storagePath) ?? null,
    }))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const evidence = rawEvidence
    .map((item) => ({
      ...item,
      signedUrl: urlByPath.get(item.storagePath) ?? null,
    }))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

  const canonicalDocumentName = new Map(
    (canonicalDocuments ?? []).map((document) => [document.id, document.file_name]),
  );
  const requirementViews = requirementRows.map((requirement) => ({
    id: requirement.id,
    kind: requirement.kind,
    requirement_type: requirement.requirement_type,
    status: requirement.status,
    valid_from: requirement.valid_from,
    expires_on: requirement.expires_on,
    notes: requirement.notes,
    document_attachment_id: requirement.document_attachment_id,
    created_at: requirement.created_at,
    responsibleName: requirement.responsible_user_id
      ? (profileName.get(requirement.responsible_user_id) ?? null)
      : null,
    documentName: requirement.document_attachment_id
      ? (canonicalDocumentName.get(requirement.document_attachment_id) ?? null)
      : null,
  }));
  const incidentViews = incidents.map((incident) => {
    const order = orderById.get(incident.order_id);
    return {
      id: incident.id,
      category: incident.category,
      severity: incident.severity,
      description: incident.description,
      requires_revisit: incident.requires_revisit,
      status: incident.status,
      occurred_at: incident.occurred_at,
      created_at: incident.created_at,
      orderId: incident.order_id,
      orderNumber: order?.order_number ?? "",
      projectName: order ? (projectName.get(order.project_id) ?? "") : "",
    };
  });
  const eventViews = eventRows.map((event) => ({
    id: event.id,
    actor_context: event.actor_context,
    event_type: event.event_type,
    status: event.status,
    changed_fields: event.changed_fields,
    note: event.note,
    client_created_at: event.client_created_at,
    created_at: event.created_at,
    actorName: event.actor_id ? (profileName.get(event.actor_id) ?? null) : null,
  }));
  const projectHistory = buildLocationProjectHistory({
    associations: associationRows,
    projects,
    sites: siteRows,
    orders,
    incidents,
    installerNames: installerName,
  });
  const clientRelation = Array.isArray(location.clients)
    ? location.clients[0]
    : location.clients;
  const locationRow: CanonicalLocation = {
    id: location.id,
    company_id: location.company_id,
    client_id: location.client_id,
    external_ref: location.external_ref,
    name: location.name,
    address: location.address,
    city: location.city,
    state: location.state,
    zone: location.zone,
    country: location.country,
    lat: location.lat,
    lng: location.lng,
    contact_name: location.contact_name,
    contact_phone: location.contact_phone,
    contact_email: location.contact_email,
    opening_hours: location.opening_hours,
    access_notes: location.access_notes,
    parking_notes: location.parking_notes,
    technical_notes: location.technical_notes,
    risk_notes: location.risk_notes,
    permanent_notes: location.permanent_notes,
    source: location.source,
    archived_at: location.archived_at,
    created_at: location.created_at,
    updated_at: location.updated_at,
  };
  // El editor valida la zona contra el proyecto. En datos antiguos puede haber
  // una proyeccion cuyo proyecto ya no admita la zona canonica; en ese caso no
  // ofrecemos un formulario que fallaria al guardar.
  const editableSite = siteRows.find((site) =>
    projects.some(
      (project) =>
        project.id === site.project_id && project.zones.includes(location.zone),
    ),
  );
  const editableProject = editableSite
    ? projects.find((project) => project.id === editableSite.project_id)
    : null;

  return {
    location: locationRow,
    client: clientRelation ?? null,
    projects: projectHistory,
    requirements: requirementViews,
    documents,
    evidence,
    incidents: incidentViews,
    events: eventViews,
    summary: {
      projectCount: projectHistory.length,
      orderCount: orders.length,
      completedOrderCount: orders.filter((order) => order.status === "finalizada")
        .length,
      evidenceCount: evidence.length,
      incidentCount: incidents.length,
      openIncidentCount: incidents.filter((incident) => incident.status === "open")
        .length,
    },
    editContext:
      editableSite && editableProject
        ? {
            projectId: editableProject.id,
            siteId: editableSite.id,
            country: editableProject.country,
            zones: editableProject.zones,
          }
        : null,
  };
}

/**
 * Sólo los permisos y requisitos de una locación — sin el resto de la ficha
 * (historial, evidencia, eventos).
 *
 * Existe aparte de `fetchCanonicalLocationDetail` a propósito: se usa desde
 * la página del sitio dentro de un proyecto, que hoy no necesita nada más de
 * la locación. Pedir la ficha completa ahí traería consultas de sobra en una
 * pantalla que ya arma su propia carga en paralelo.
 */
export async function fetchLocationRequirements(
  supabase: SupabaseClient<Database>,
  locationId: string,
): Promise<LocationRequirementView[]> {
  const { data: requirements } = await supabase
    .from("location_requirements")
    .select(
      "id, kind, requirement_type, status, valid_from, expires_on, responsible_user_id, notes, document_attachment_id, created_at",
    )
    .eq("location_id", locationId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  const rows = requirements ?? [];
  if (rows.length === 0) return [];

  const profileIds = [
    ...new Set(
      rows
        .map((row) => row.responsible_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const documentIds = [
    ...new Set(
      rows
        .map((row) => row.document_attachment_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: profiles }, { data: documents }] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    documentIds.length
      ? supabase
          .from("location_attachments")
          .select("id, file_name")
          .in("id", documentIds)
      : Promise.resolve({ data: [] as { id: string; file_name: string }[] }),
  ]);
  const profileName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const documentName = new Map((documents ?? []).map((d) => [d.id, d.file_name]));

  return rows.map((requirement) => ({
    id: requirement.id,
    kind: requirement.kind,
    requirement_type: requirement.requirement_type,
    status: requirement.status,
    valid_from: requirement.valid_from,
    expires_on: requirement.expires_on,
    notes: requirement.notes,
    document_attachment_id: requirement.document_attachment_id,
    created_at: requirement.created_at,
    responsibleName: requirement.responsible_user_id
      ? (profileName.get(requirement.responsible_user_id) ?? null)
      : null,
    documentName: requirement.document_attachment_id
      ? (documentName.get(requirement.document_attachment_id) ?? null)
      : null,
  }));
}
