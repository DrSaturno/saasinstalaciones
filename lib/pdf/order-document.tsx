import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { ORDER_STATUS } from "@/lib/domain/status";
import type { OrderStatus } from "@/types/database";

export type OrderPdfData = {
  orderNumber: string;
  title: string;
  status: OrderStatus;
  statusLabel: string;
  priorityLabel: string;
  description: string;
  scheduledDate: string | null;
  createdAt: string;
  amount: string | null;
  indoor: boolean;
  requiresFreight: boolean;
  freightDetails: string;
  company: string;
  project: string;
  client: string;
  installer: string;
  site: {
    name: string;
    address: string;
    city: string;
    state: string;
    contactName: string;
    contactPhone: string;
    openingHours: string;
    accessNotes: string;
    parkingNotes: string;
    technicalNotes: string;
    riskNotes: string;
  };
  history: { label: string; note: string; date: string }[];
  /** Etiquetas ya traducidas: el PDF no tiene acceso al contexto de next-intl. */
  labels: Record<string, string>;
};

const BRAND = "#2597d0";
const INK = "#070709";
const MUTED = "#60606c";
const LINE = "#e6e7eb";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9.5,
    color: INK,
    fontFamily: "Helvetica",
    lineHeight: 1.45,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 12,
  },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND },
  company: { fontSize: 9, color: MUTED, marginTop: 2 },
  orderNumber: { fontSize: 17, fontFamily: "Helvetica-Bold", textAlign: "right" },
  orderMeta: { fontSize: 8, color: MUTED, textAlign: "right", marginTop: 2 },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", flex: 1, paddingRight: 12 },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 9,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },

  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: BRAND,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 4,
    marginBottom: 8,
  },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", paddingRight: 14, marginBottom: 8 },
  cellFull: { width: "100%", marginBottom: 8 },
  label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 10, marginTop: 1.5 },
  paragraph: { fontSize: 9.5, marginTop: 2 },

  chips: { flexDirection: "row", marginTop: 2 },
  chip: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 7,
    fontSize: 8,
    marginRight: 6,
  },

  historyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 5,
  },
  historyDate: { width: 88, fontSize: 8, color: MUTED },
  historyLabel: { width: 92, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  historyNote: { flex: 1, fontSize: 8.5 },

  signatures: { flexDirection: "row", marginTop: 34 },
  signature: { flex: 1, marginRight: 24 },
  signatureLine: { borderTopWidth: 1, borderTopColor: INK, paddingTop: 4 },
  signatureLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase" },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
  },
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.cellFull}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.paragraph}>{value}</Text>
    </View>
  );
}

/**
 * Orden de trabajo en PDF, pensada para imprimirse y llevarse al punto.
 *
 * El orden de las secciones sigue el de una visita real: qué hay que hacer,
 * dónde queda y a quién buscar, cómo se entra, qué mirar antes de empezar, y
 * qué pasó hasta ahora. Cierra con firmas, que es lo que se pide en obra.
 */
export function OrderDocument({ data }: { data: OrderPdfData }) {
  const l = data.labels;
  const status = ORDER_STATUS[data.status];
  const site = data.site;

  const logistics = [
    data.indoor ? l.indoor : l.outdoor,
    data.requiresFreight ? l.withFreight : l.withoutFreight,
  ];

  return (
    <Document
      title={`${data.orderNumber} · ${data.title}`}
      author={data.company}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>{data.company}</Text>
            <Text style={styles.company}>{l.documentKind}</Text>
          </View>
          <View>
            <Text style={styles.orderNumber}>{data.orderNumber}</Text>
            <Text style={styles.orderMeta}>
              {l.issued}: {data.createdAt}
            </Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>{data.title}</Text>
          <Text
            style={{
              ...styles.badge,
              backgroundColor: status.bg,
              color: status.fg,
            }}
          >
            {data.statusLabel}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{l.assignment}</Text>
          <View style={styles.grid}>
            <Field label={l.client} value={data.client} />
            <Field label={l.project} value={data.project} />
            <Field label={l.installer} value={data.installer} />
            <Field label={l.scheduledDate} value={data.scheduledDate ?? "—"} />
            <Field label={l.priority} value={data.priorityLabel} />
            {data.amount ? <Field label={l.amount} value={data.amount} /> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{l.site}</Text>
          <View style={styles.grid}>
            <Field label={l.siteName} value={site.name} />
            <Field
              label={l.address}
              value={[site.address, site.city, site.state].filter(Boolean).join(", ")}
            />
            <Field label={l.contact} value={site.contactName} />
            <Field label={l.phone} value={site.contactPhone} />
            <Field label={l.openingHours} value={site.openingHours} />
            <View style={styles.cell}>
              <Text style={styles.label}>{l.logistics}</Text>
              <View style={styles.chips}>
                {logistics.map((chip) => (
                  <Text key={chip} style={styles.chip}>
                    {chip}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </View>

        {data.description ||
        site.accessNotes ||
        site.parkingNotes ||
        site.technicalNotes ||
        site.riskNotes ||
        data.freightDetails ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{l.instructions}</Text>
            <Block label={l.description} value={data.description} />
            <Block label={l.access} value={site.accessNotes} />
            <Block label={l.parking} value={site.parkingNotes} />
            <Block label={l.technical} value={site.technicalNotes} />
            <Block label={l.risks} value={site.riskNotes} />
            <Block label={l.freight} value={data.freightDetails} />
          </View>
        ) : null}

        {data.history.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{l.history}</Text>
            {data.history.map((entry, index) => (
              <View key={index} style={styles.historyRow}>
                <Text style={styles.historyDate}>{entry.date}</Text>
                <Text style={styles.historyLabel}>{entry.label}</Text>
                <Text style={styles.historyNote}>{entry.note || "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>{l.installerSignature}</Text>
            </View>
          </View>
          <View style={styles.signature}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>{l.clientSignature}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {data.orderNumber} · {data.company}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
