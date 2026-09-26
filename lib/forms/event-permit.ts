// CCC's event permit application is an online form (ccc.tfaforms.net/177), not a PDF. It accepts answers in the link
// (?tfa_17=Hagley+Summer+Sounds), so we open the council's own form already filled in. Field ids come from the form
// (saved in the knowledge base). Anything we don't know is left for the organiser, never guessed.
import type { Classification, EventProfile } from "../schemas";
import { crowdKit } from "../siteplan/layout";

export const EVENT_PERMIT_FORM = "https://ccc.tfaforms.net/177";
type Row = { label: string; value: string | null; param?: [string, string] };
export type PermitSection = { title: string; rows: Row[] };

const text = (id: string, label: string, value: string | number | null | undefined): Row =>
  ({ label, value: value == null || value === "" ? null : String(value), param: value == null || value === "" ? undefined : [id, String(value)] });
/** A yes/no question: the form takes the chosen option's id. */
const yesNo = (id: string, yes: string, no: string, label: string, value: boolean | null | undefined): Row =>
  ({ label, value: value == null ? null : value ? "Yes" : "No", param: value == null ? undefined : [id, value ? yes : no] });
const nzDate = (d: string | null) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : null;

export function eventPermit(p: EventProfile, cls: Classification | null, wasteText: string | null, description: string | null = null) {
  const clean = (t: string | null) => t?.replace(/\s*\((?:fictional|demo)[^)]*\)/gi, "") ?? null;
  const [person, ...rest] = (p.people.organiser.value ?? "").split(",").map((s) => s.trim());
  const org = rest.join(", ") || null;
  const contact = p.people.contact.value ?? "";
  const phone = contact.match(/\+?\d[\d\s-]{6,}\d/)?.[0] ?? null;
  const email = contact.match(/[^\s,]+@[^\s,]+/)?.[0] ?? null;
  const n = p.peakAttendance.value;
  const date = nzDate(p.date.value);
  const stalls = p.food.stalls.value;
  const alcohol = p.alcohol.supply.value;
  const type = cls?.category === "community" ? ["tfa_20", "Community"] : cls?.category === "commercial" ? ["tfa_21", "Commercial"] : null;

  const sections: PermitSection[] = [
    { title: "Contact details", rows: [
      text("tfa_2", "Applicant's name", person), text("tfa_3", "Phone (mobile preferred)", phone), text("tfa_4", "Email", email),
      yesNo("tfa_5", "tfa_6", "tfa_7", "Will you be the contact on the day of the event?", person ? true : null),
    ] },
    { title: "Organisation details", rows: [
      text("tfa_11", "Company/organisation name", org), text("tfa_13", "Postal address", null), text("tfa_12", "Postcode", null),
      text("tfa_15", "Organisation email", email), text("tfa_14", "Organisation phone", phone),
    ] },
    { title: "Event information", rows: [
      text("tfa_17", "Event name", p.name.value),
      text("tfa_18", "Describe your event", clean(description)),
      { label: "Type of event", value: type?.[1] ?? null, param: type ? ["tfa_19", type[0]] : undefined },
      text("tfa_32", "Requested event location", p.venue.name.value),
      text("tfa_33", "Estimated total number of attendees", n), text("tfa_48", "Peak attendance at any given time", n),
    ] },
    { title: "Event dates", rows: [
      text("tfa_59", "Event starts (date)", date), text("tfa_65", "Event starts (time)", p.startTime.value),
      text("tfa_92", "Event finishes (date)", date), text("tfa_90", "Event finishes (time)", p.endTime.value),
      text("tfa_63", "Pack-in starts (date)", null), text("tfa_87", "Pack-up finishes (date)", null),
      yesNo("tfa_95", "tfa_96", "tfa_97", "Leaving infrastructure on site overnight?", date ? false : null),
    ] },
    { title: "Event infrastructure", rows: [
      yesNo("tfa_122", "tfa_123", "tfa_124", "Installing fencing or temporary barriers?", alcohol === "sold" ? true : null),
      text("tfa_108", "Fencing type and size", alcohol === "sold" ? `Temporary fencing around the ${p.alcohol.area.value?.toLowerCase() ?? "bar"}` : null),
      yesNo("tfa_128", "tfa_129", "tfa_130", "Installing any marquees?", p.structures.marquees.value == null ? null : p.structures.marquees.value > 0),
      yesNo("tfa_134", "tfa_135", "tfa_136", "Any marquees over 100 sqm?", p.structures.largestMarqueeSqm.value == null ? null : p.structures.largestMarqueeSqm.value > 100),
      yesNo("tfa_142", "tfa_143", "tfa_144", "Installing a stage?", p.structures.stageOver1m.value),
      yesNo("tfa_148", "tfa_149", "tfa_150", "Any inflatable devices or bouncy castles?", p.structures.inflatables.value),
      yesNo("tfa_156", "tfa_157", "tfa_158", "Any mechanical amusement devices?", p.structures.mechanicalRides.value),
    ] },
    { title: "Entertainment", rows: [
      yesNo("tfa_164", "tfa_165", "tfa_166", "Will you have a PA system?", p.amplifiedSound.value),
      yesNo("tfa_167", "tfa_168", "tfa_169", "Will you have amplified music?", p.amplifiedSound.value),
    ] },
    { title: "Food and beverages", rows: [
      yesNo("tfa_177", "tfa_178", "tfa_179", "Commercial food vendors?", stalls == null ? null : stalls > 0),
      text("tfa_180", "How many food vendors?", stalls && stalls > 0 ? stalls : null),
      yesNo("tfa_196", "tfa_197", "tfa_198", "Will alcohol be sold?", alcohol == null ? null : alcohol === "sold"),
      yesNo("tfa_202", "tfa_203", "tfa_204", "Will alcohol be served free of charge?", alcohol == null ? null : alcohol === "free"),
    ] },
    { title: "Power, toilets and vehicles", rows: [
      yesNo("tfa_214", "tfa_215", "tfa_216", "Will you be providing generators?", p.generators.value),
      yesNo("tfa_229", "tfa_230", "tfa_231", "Providing additional toilets?", n ? true : null),
      text("tfa_233", "How many toilets?", n ? crowdKit(p).toilets : null),
      yesNo("tfa_240", "tfa_241", "tfa_242", "Vehicle access for loading and unloading?", p.vehicleAccess.value),
    ] },
    { title: "Traffic management", rows: [
      yesNo("tfa_259", "tfa_260", "tfa_261", "Could the event affect roads or footpaths?", p.roadOrFootpathImpact.value),
      yesNo("tfa_267", "tfa_268", "tfa_269", "Do you need a full road closure?", p.roadOrFootpathImpact.value === false ? false : null),
    ] },
    { title: "Waste management", rows: [text("tfa_279", "How will waste be managed at the event?", clean(wasteText))] },
    { title: "Declarations", rows: [text("tfa_311", "Name of applicant", person)] },
  ];
  const params = new URLSearchParams(sections.flatMap((s) => s.rows.flatMap((r) => (r.param ? [r.param] : []))));
  return { sections, url: `${EVENT_PERMIT_FORM}?${params}` };
}
