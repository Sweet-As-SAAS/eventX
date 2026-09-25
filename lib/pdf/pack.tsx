// PDF pack. Lane C owns layout. Cover page, each document, sources appendix.
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { DraftDocument } from "../schemas";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, lineHeight: 1.5 },
  h1: { fontSize: 22, marginBottom: 12 }, h2: { fontSize: 14, marginTop: 14, marginBottom: 4 },
  small: { fontSize: 9, color: "#555" },
});

const DISCLAIMER = "Prepared by HostReady. The organiser reviews every page and lodges it with the council. This is not legal advice.";

export function PackPdf({ eventName, docs, sources }: { eventName: string; docs: DraftDocument[]; sources: string[] }) {
  return (
    <Document>
      <Page style={s.page}>
        <Text style={s.h1}>{eventName}</Text>
        <Text>Council pack: {docs.length} documents.</Text>
        <Text style={s.small}>{DISCLAIMER}</Text>
      </Page>
      {docs.map((d) => (
        <Page key={d.documentType} style={s.page}>
          <Text style={s.h1}>{d.title}</Text>
          {d.sections.map((sec) => (
            <View key={sec.heading}><Text style={s.h2}>{sec.heading}</Text><Text>{sec.body}</Text></View>
          ))}
          <Text style={s.small} fixed>{DISCLAIMER}</Text>
        </Page>
      ))}
      <Page style={s.page}>
        <Text style={s.h1}>Sources</Text>
        {sources.map((u) => <Text key={u} style={s.small}>{u}</Text>)}
      </Page>
    </Document>
  );
}

export const renderPack = (props: Parameters<typeof PackPdf>[0]) => renderToBuffer(<PackPdf {...props} />);
