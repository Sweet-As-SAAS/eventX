// PDF pack and single-document PDFs. Lane C owns layout.
// Each document follows its council template: the council's section headings in the council's order, under the
// council's name, with the event details the forms ask for. The hazard register is the council's risk assessment
// table. Gaps the organiser must fill are highlighted. We never copy the council's own files (see lane B brief).
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { DocumentType, DraftDocument, EventProfile } from "../schemas";

const s = StyleSheet.create({
  page: { padding: 48, paddingBottom: 76, fontSize: 10.5, lineHeight: 1.45, fontFamily: "Helvetica" },
  council: { fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", lineHeight: 1.25, marginTop: 4, marginBottom: 10 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4 },
  small: { fontSize: 8.5, color: "#555" },
  details: { borderWidth: 1, borderColor: "#999", marginBottom: 10 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#999" },
  label: { width: 150, padding: 5, backgroundColor: "#eee", fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  value: { flex: 1, padding: 5 },
  th: { flex: 1, padding: 4, backgroundColor: "#eee", fontFamily: "Helvetica-Bold", fontSize: 8.5, borderRightWidth: 1, borderColor: "#999" },
  td: { flex: 1, padding: 4, fontSize: 8.5, borderRightWidth: 1, borderColor: "#999" },
  gap: { backgroundColor: "#ffe58a" },
  source: { marginBottom: 10 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#555", flexDirection: "row", justifyContent: "space-between" },
});

const DISCLAIMER = "HostReady prepares documents. You review them and lodge them with the council. This is not legal advice.";

export type PackSource = { url: string; lastChecked: string | null };
export type PackDoc = { doc: DraftDocument; templateUrl?: string | null; checklist?: PackSource | null };
export type PackEvent = { name: string; council?: string | null; profile?: EventProfile | null };

/** [PLACEHOLDER] gaps highlighted so they can't be lodged by accident. */
const Gaps = ({ text }: { text: string }) => (
  <>{text.split(/(\[[^\]]+\])/g).map((part, i) => (/^\[[^\]]+\]$/.test(part) ? <Text key={i} style={s.gap}>{part}</Text> : part))}</>
);

const Footer = () => (
  <View style={s.footer} fixed>
    <Text>{DISCLAIMER}</Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </View>
);

/** The event details every council form opens with. Unknown values stay visible as gaps. */
function EventDetails({ event }: { event: PackEvent }) {
  const p = event.profile;
  const gap = (v: string | number | null | undefined, what: string) => (v === null || v === undefined || v === "" ? `[${what}]` : String(v));
  const rows: [string, string][] = [
    ["Event name", event.name],
    ["Organiser", gap(p?.people.organiser.value, "ORGANISER NAME")],
    ["Contact", gap(p?.people.contact.value, "PHONE AND EMAIL")],
    ["Date", p?.date.value && /^\d{4}-\d{2}-\d{2}$/.test(p.date.value)
      ? new Date(`${p.date.value}T00:00:00Z`).toLocaleDateString("en-NZ", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "[EVENT DATE]"],
    ["Times", p?.startTime.value && p?.endTime.value ? `${p.startTime.value} to ${p.endTime.value}` : "[START AND FINISH TIMES]"],
    ["Venue", gap(p?.venue.name.value, "VENUE")],
    ["Peak attendance", gap(p?.peakAttendance.value, "PEAK ATTENDANCE")],
  ];
  return (
    <View style={s.details} wrap={false}>
      {rows.map(([k, v], i) => (
        <View key={k} style={i === rows.length - 1 ? [s.row, { borderBottomWidth: 0 }] : s.row}>
          <Text style={s.label}>{k}</Text>
          <Text style={s.value}><Gaps text={v} /></Text>
        </View>
      ))}
    </View>
  );
}

/** "1. foo\n2. bar" into ["foo", "bar"]; null when the body isn't a numbered list. */
function numbered(body: string): string[] | null {
  const items = body.split("\n").map((l) => l.trim()).filter(Boolean);
  return items.length && items.every((l) => /^\d+[.)]\s/.test(l)) ? items.map((l) => l.replace(/^\d+[.)]\s+/, "")) : null;
}

/** The council's risk assessment is a table: one row per activity, one column per template heading. */
function RiskTable({ doc }: { doc: DraftDocument }) {
  const cols = doc.sections.map((sec, i) => ({ key: i, heading: sec.heading, body: sec.body, cells: numbered(sec.body) }));
  const table = cols.filter((c) => c.cells);
  const notes = cols.filter((c) => !c.cells);
  const rows = Math.max(0, ...table.map((c) => c.cells!.length));
  return (
    <>
      <View style={{ borderWidth: 1, borderColor: "#999", borderRightWidth: 0 }}>
        <View style={s.row} fixed>{table.map((c) => <Text key={c.key} style={s.th}>{c.heading}</Text>)}</View>
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={r === rows - 1 ? [s.row, { borderBottomWidth: 0 }] : s.row} wrap={false}>
            {table.map((c) => <Text key={c.key} style={s.td}><Gaps text={c.cells![r] ?? ""} /></Text>)}
          </View>
        ))}
      </View>
      {notes.map((c) => <View key={c.key}><Text style={s.h2}>{c.heading}</Text><Text><Gaps text={c.body} /></Text></View>)}
    </>
  );
}

const TABLE_TYPES: ReadonlySet<DocumentType> = new Set(["hazard_register"]);

/** One document, laid out to its council template. */
function DocPages({ event, item }: { event: PackEvent; item: PackDoc }) {
  const { doc, templateUrl, checklist } = item;
  const table = TABLE_TYPES.has(doc.documentType) && doc.sections.some((sec) => numbered(sec.body));
  return (
    <Page style={s.page} orientation={table ? "landscape" : "portrait"}>
      {event.council && <Text style={s.council}>{event.council}</Text>}
      <Text style={s.h1}>{doc.title}</Text>
      <EventDetails event={event} />
      {table ? <RiskTable doc={doc} /> : doc.sections.map((sec, i) => (
        <View key={i}>
          <Text style={s.h2} minPresenceAhead={40}>{sec.heading}</Text>
          <Text><Gaps text={sec.body} /></Text>
        </View>
      ))}
      <View style={{ marginTop: 16 }} wrap={false}>
        {templateUrl && <Text style={s.small}>Laid out to the council template: {templateUrl}</Text>}
        {checklist?.url && <Text style={s.small}>Checked against the council checklist: {checklist.url}{checklist.lastChecked ? ` (source checked ${checklist.lastChecked})` : ""}</Text>}
        {doc.placeholders.length > 0 && <Text style={s.small}>Highlighted gaps must be filled in before you lodge this.</Text>}
      </View>
      <Footer />
    </Page>
  );
}

export function DocPdf({ event, item }: { event: PackEvent; item: PackDoc }) {
  return <Document title={item.doc.title}><DocPages event={event} item={item} /></Document>;
}

export function PackPdf({ event, docs, sources }: { event: PackEvent; docs: PackDoc[]; sources: PackSource[] }) {
  return (
    <Document title={`${event.name}: council pack`}>
      <Page style={s.page}>
        {event.council && <Text style={s.council}>{event.council}</Text>}
        <Text style={s.h1}>{event.name}</Text>
        <Text>Council pack: {docs.length} documents.</Text>
        {docs.map(({ doc }) => <Text key={doc.documentType}>· {doc.title}</Text>)}
        <Footer />
      </Page>
      {docs.map((item) => <DocPages key={item.doc.documentType} event={event} item={item} />)}
      <Page style={s.page}>
        <Text style={s.h1}>Sources</Text>
        {sources.map(({ url, lastChecked }) => (
          <View key={url} style={s.source} wrap={false}>
            <Text style={s.small}>{url}</Text>
            <Text style={s.small}>Source checked: {lastChecked ?? "date not recorded"}</Text>
          </View>
        ))}
        <Footer />
      </Page>
    </Document>
  );
}

export const renderPack = (props: Parameters<typeof PackPdf>[0]) => renderToBuffer(<PackPdf {...props} />);
export const renderDoc = (props: Parameters<typeof DocPdf>[0]) => renderToBuffer(<DocPdf {...props} />);
/** "Hazard Register for X" into "hazard-register-for-x.pdf". */
export const pdfName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "document"}.pdf`;
