import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type FinanceOrderPdfData = {
  orderNumber: string; title: string; client: string; site: string; zone: string;
  status: string; currency: string; clientAmount: number | null;
  entries: { direction: string; party: string; category: string; amount: number;
    paid: number; open: number; due: string | null; status: string }[];
  invoices: { number: string; direction: string; date: string; amount: number }[];
  transactions: { date: string; direction: string; party: string; amount: number; method: string }[];
  labels: Record<string, string>;
};

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#070709", fontFamily: "Helvetica" },
  brand: { color: "#2597d0", fontSize: 10, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 7 },
  subtitle: { color: "#60606c", fontSize: 9, marginTop: 4 },
  section: { marginTop: 18 },
  sectionTitle: { color: "#2597d0", fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 7 },
  cards: { flexDirection: "row", gap: 8, marginTop: 17 },
  card: { flex: 1, borderWidth: 1, borderColor: "#e6e7eb", borderRadius: 6, padding: 9 },
  cardLabel: { color: "#60606c", fontSize: 8 },
  cardValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 5 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e6e7eb", paddingVertical: 7 },
  rowHead: { backgroundColor: "#f3f7fa", fontFamily: "Helvetica-Bold" },
  colParty: { width: "27%", paddingRight: 5 },
  colCategory: { width: "18%", paddingRight: 5 },
  colMoney: { width: "18%", textAlign: "right", paddingRight: 5 },
  colDate: { width: "19%", textAlign: "right" },
  note: { color: "#60606c", fontSize: 8, marginTop: 12 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36,
    borderTopWidth: 1, borderTopColor: "#e6e7eb", paddingTop: 7,
    color: "#868c98", fontSize: 7 },
});

export function FinanceOrderDocument({ data }: { data: FinanceOrderPdfData }) {
  const t = (key: string) => data.labels[key] ?? key;
  const money = (amount: number) => new Intl.NumberFormat("es-AR", {
    style: "currency", currency: data.currency,
  }).format(amount);
  const active = data.entries.filter((entry) => entry.status !== "void");
  const costs = active.filter((entry) => entry.direction === "payable")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const payOpen = active.filter((entry) => entry.direction === "payable")
    .reduce((sum, entry) => sum + entry.open, 0);
  const collectOpen = active.filter((entry) => entry.direction === "receivable")
    .reduce((sum, entry) => sum + entry.open, 0);
  return <Document title={`${t("title")} ${data.orderNumber}`}>
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.brand}>{t("brand")}</Text>
      <Text style={styles.title}>{data.orderNumber} · {data.title}</Text>
      <Text style={styles.subtitle}>{data.client} · {data.site} · {data.zone} · {data.status}</Text>
      <View style={styles.cards}>
        <View style={styles.card}><Text style={styles.cardLabel}>{t("clientAmount")}</Text><Text style={styles.cardValue}>{data.clientAmount == null ? "—" : money(data.clientAmount)}</Text></View>
        <View style={styles.card}><Text style={styles.cardLabel}>{t("supplierCosts")}</Text><Text style={styles.cardValue}>{money(costs)}</Text></View>
        <View style={styles.card}><Text style={styles.cardLabel}>{t("payOpen")}</Text><Text style={styles.cardValue}>{money(payOpen)}</Text></View>
        <View style={styles.card}><Text style={styles.cardLabel}>{t("collectOpen")}</Text><Text style={styles.cardValue}>{money(collectOpen)}</Text></View>
      </View>
      <View style={styles.section}><Text style={styles.sectionTitle}>{t("obligations")}</Text>
        <View style={[styles.row, styles.rowHead]}><Text style={styles.colParty}>{t("party")}</Text><Text style={styles.colCategory}>{t("category")}</Text><Text style={styles.colMoney}>{t("amount")}</Text><Text style={styles.colMoney}>{t("paid")}</Text><Text style={styles.colMoney}>{t("open")}</Text></View>
        {active.map((entry, index) => <View key={index} style={styles.row} wrap={false}>
          <Text style={styles.colParty}>{entry.party}{"\n"}{entry.direction === "payable" ? t("payable") : t("receivable")}</Text>
          <Text style={styles.colCategory}>{entry.category}{"\n"}{entry.due ?? t("noDate")}</Text>
          <Text style={styles.colMoney}>{money(entry.amount)}</Text>
          <Text style={styles.colMoney}>{money(entry.paid)}</Text>
          <Text style={styles.colMoney}>{money(entry.open)}</Text>
        </View>)}
        {active.length === 0 && <Text style={styles.note}>{t("empty")}</Text>}
      </View>
      <View style={styles.section}><Text style={styles.sectionTitle}>{t("invoices")}</Text>
        {data.invoices.map((invoice, index) => <View key={index} style={styles.row} wrap={false}>
          <Text style={{ width: "45%" }}>{invoice.number}</Text><Text style={{ width: "25%" }}>{invoice.direction}</Text>
          <Text style={{ width: "15%" }}>{invoice.date}</Text><Text style={{ width: "15%", textAlign: "right" }}>{money(invoice.amount)}</Text>
        </View>)}
        {data.invoices.length === 0 && <Text style={styles.note}>{t("emptyInvoices")}</Text>}
      </View>
      <View style={styles.section}><Text style={styles.sectionTitle}>{t("cash")}</Text>
        {data.transactions.map((tx, index) => <View key={index} style={styles.row} wrap={false}>
          <Text style={{ width: "20%" }}>{tx.date}</Text><Text style={{ width: "35%" }}>{tx.party}</Text>
          <Text style={{ width: "25%" }}>{tx.method}</Text><Text style={{ width: "20%", textAlign: "right" }}>{tx.direction === "payable" ? "−" : "+"}{money(tx.amount)}</Text>
        </View>)}
        {data.transactions.length === 0 && <Text style={styles.note}>{t("emptyCash")}</Text>}
      </View>
      <Text style={styles.footer}>{t("footer")}</Text>
    </Page>
  </Document>;
}
