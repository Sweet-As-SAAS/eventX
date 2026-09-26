// The council's own Application for Special Licence (CCC form CON4414, April 2023), filled in from the event.
// The form's fields have generic names ("Text Field 248"), so each one is mapped here by the question it sits under.
// Anything only the organiser knows (postal address, date of birth, certificate number, signature) stays blank for them.
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFTextField, StandardFonts } from "pdf-lib";
import type { DraftDocument, EventProfile, Licence } from "../schemas";
import { fmtTime } from "../../components/format";

const FORM = path.join(process.cwd(), "lib/pdf/forms/ccc-special-licence.pdf");

// Field names by question, page by page.
const F = {
  onSite: "Check Box 102",
  large: "Check Box 112", medium: "Check Box 113", small: "Check Box 114", events: "Text Field 247",
  legalName: "Text Field 248", contactName: "Text Field 250", phone: "Text Field 252", mobile: "Text Field 251",
  email: "Text Field 254", preferredContact: "Text Field 255",
  status: { person: "Check Box 115", company: "Check Box 116", trustee: "Check Box 117", society: "Check Box 122" },
  exemptNo: "Check Box 110", managerName: "Text Field 259",
  managerExpiry: "Text Field 263", managerOtherRoleNo: "Check Box 127", managerOtherRoleYes: "Check Box 128", managerOtherRole: "Text Field 261",
  premisesAddress: "Text Field 269", siteName: "Text Field 270", licenceHeldNo: "Check Box 131",
  buildingYes: "Check Box 134", buildingNo: "Check Box 133", buildingDetails: "Text Field 277",
  ownNo: "Check Box 135", ownerName: "Text Field 278", ownerAddress: "Text Field 279",
  tenureOther: "Check Box 142", tenureOtherText: "Text Field 285", alcoholPermission: "Text Field 286",
  organiser: "Text Field 288", organiserRole: "Text Field 290", organiserPhone: "Text Field 292", organiserEmail: "Text Field 289",
  eventName: "Text Field 293", purpose: "Text Field 295", linkedNo: "Check Box 157",
  areas: [["Text Field 296", "Text Field 297"], ["Text Field 298", "Text Field 299"], ["Text Field 300", "Text Field 301"]],
  entry: "Text Field 303", entertainment: "Text Field 302",
  numbers: "Text Field 305", ages: "Text Field 304", when: "Text Field 306", saleHours: "Text Field 307", otherGoods: "Text Field 308",
  foodType: "Text Field 315", foodBy: "Text Field 316",
  alcoholRange: "Text Field 326", lowAlcohol: "Text Field 327", nonAlcoholic: "Text Field 330",
  transport: "Text Field 328", responsible: "Text Field 329", prohibited: "Text Field 317", otherSteps: "Text Field 318",
  containers: "Text Field 319", water: "Text Field 320", nearby: "Text Field 321", landUse: "Text Field 322",
  staff: "Text Field 323", noise: "Text Field 324", disorder: "Text Field 325",
  attachSitePlan: "Check Box 145", attachConsents: "Check Box 146", attachAmp: "Check Box 148", attachFood: "Check Box 149",
  shortNoticeNo: "Check Box 153",
} as const;

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-NZ", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const minus30 = (t: string) => { const [h, m] = t.split(":").map(Number); const x = h * 60 + m - 30; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
/** "Jordan Example, Summer Sounds Trust" -> person and organisation. */
const splitOrganiser = (s: string | null) => { const [person, ...org] = (s ?? "").split(",").map((x) => x.trim()); return { person: person || null, org: org.join(", ") || null }; };
const section = (doc: DraftDocument | null, heading: RegExp) => doc?.sections.find((s) => heading.test(s.heading))?.body
  .replace(/^DEMO ONLY\.[^.]*\.\s*/, "").replace(/\s*\(fictional[^)]*\)|\bfictional demo /gi, "") ?? null;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `flat` bakes the answers into the page, for joining onto the council pack. */
export async function fillSpecialLicence(p: EventProfile, draft: DraftDocument | null, licences: Licence[], today: string, flat = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await fs.readFile(FORM));
  const form = pdf.getForm();
  const text = (name: string, value: string | null | undefined) => { if (value) form.getTextField(name).setText(value); };
  const tick = (name: string, on = true) => { if (on) form.getCheckBox(name).check(); };

  const n = p.peakAttendance.value ?? 0;
  const { person, org } = splitOrganiser(p.people.organiser.value);
  const contact = p.people.contact.value ?? "";
  const phone = contact.match(/\+?\d[\d\s-]{6,}\d/)?.[0] ?? null;
  const email = contact.match(/[^\s,]+@[^\s,]+/)?.[0] ?? null;
  const manager = p.people.dutyManager.value;
  const cert = licences.find((l) => /duty manager|manager/i.test(l.type) && manager && l.holderName === manager);
  const security = p.people.security.value;
  const venue = p.venue.name.value ?? "";
  const date = p.date.value, start = p.startTime.value, end = p.endTime.value;
  const hours = start && end ? `${fmtTime(start)} to ${fmtTime(end)}` : "";
  const saleEnd = end ? minus30(end) : null;
  const saleHours = date && start && saleEnd ? `${longDate(date)}, ${fmtTime(start)} to ${fmtTime(saleEnd)} (bar closes 30 minutes before the event ends)` : null;
  const area = cap(p.alcohol.area.value ?? "Fenced bar area");
  const over18 = /18/.test(area) || p.childrenAttending.value;
  const marquee = (p.structures.largestMarqueeSqm.value ?? 0) > 100;

  // 1-2. Application and fee
  tick(F.onSite);
  tick(n > 400 ? F.large : n >= 100 ? F.medium : F.small);
  text(F.events, "1");

  // 3. Applicant
  text(F.legalName, org ?? person);
  tick(org && /trust/i.test(org) ? F.status.trustee : org && /society|inc\b/i.test(org) ? F.status.society : org && /ltd|limited/i.test(org) ? F.status.company : F.status.person);
  text(F.contactName, person);
  text(F.mobile, phone);
  text(F.email, email);
  text(F.preferredContact, email ? "Email" : phone ? "Phone" : null);
  if (manager) {
    tick(F.exemptNo);
    text(F.managerName, manager);
    text(F.managerExpiry, cert ? new Date(`${cert.expiresOn}T00:00:00Z`).toLocaleDateString("en-NZ", { timeZone: "UTC" }) : null);
    const alsoOrganiser = person && manager === person;
    tick(alsoOrganiser ? F.managerOtherRoleYes : F.managerOtherRoleNo);
    if (alsoOrganiser) text(F.managerOtherRole, "Also the event organiser");
  }

  // 4. Premises
  text(F.premisesAddress, venue ? `${venue}, Christchurch` : null);
  text(F.siteName, `${p.name.value ?? "Event"}: ${area.charAt(0).toLowerCase()}${area.slice(1)}`);
  tick(F.licenceHeldNo);
  tick(marquee ? F.buildingYes : F.buildingNo);
  if (marquee) text(F.buildingDetails, `Marquee over 100 sqm (largest about ${p.structures.largestMarqueeSqm.value} sqm). Building consent exemption applied for with the council.`);
  if (p.venue.councilLand.value) {
    tick(F.ownNo);
    text(F.ownerName, "Christchurch City Council");
    text(F.ownerAddress, "53 Hereford Street, Christchurch 8011");
    tick(F.tenureOther);
    text(F.tenureOtherText, `Council event permit for ${venue} (applied for)`);
    text(F.alcoholPermission, "Alcohol sales are included in the event permit application to the council.");
  }

  // 5. Event
  text(F.organiser, person);
  text(F.organiserRole, org ? `Event organiser, ${org}` : "Event organiser");
  text(F.organiserPhone, phone);
  text(F.organiserEmail, email);
  text(F.eventName, p.name.value);
  text(F.purpose, `A one-day public event at ${venue} for about ${n.toLocaleString("en-NZ")} people`);
  tick(F.linkedNo);
  text(F.areas[0][0], area);
  text(F.areas[0][1], over18 ? "Restricted: no one under 18" : "Supervised");
  text(F.areas[1][0], "Rest of the event site");
  text(F.areas[1][1], "Undesignated: no alcohol sold or carried here");
  text(F.entry, `${p.openToPublic.value === false ? "Invitation only." : "Open to the public."} Entry to the ${area.toLowerCase()} is checked by staff, with ID required.`);
  text(F.entertainment, [p.amplifiedSound.value && `Live amplified music${p.structures.stageOver1m.value ? " on a stage" : ""}, ${hours}`,
    p.structures.inflatables.value && "inflatables in a kids zone", p.structures.mechanicalRides.value && "mechanical rides",
    (p.food.stalls.value ?? 0) > 0 && `${p.food.stalls.value} food stalls`].filter(Boolean).join("; ") || null);
  text(F.numbers, n ? n.toLocaleString("en-NZ") : null);
  text(F.ages, p.childrenAttending.value ? "All ages. Alcohol sold to over 18s only." : "Adults");
  text(F.when, date ? `${longDate(date)}, ${hours}` : null);
  text(F.saleHours, saleHours);
  text(F.otherGoods, (p.food.stalls.value ?? 0) > 0 ? "No. Food is sold by the food stalls; no other goods or services by the applicant." : "No.");

  // 6. Conditions (host responsibility). The draft's own wording wins where it has it, so the organiser's edits land here.
  text(F.foodType, p.food.cookingOnSite.value ? "Hot food cooked on site, available throughout sale hours" : "Food available throughout sale hours");
  text(F.foodBy, p.people.foodProvider.value);
  text(F.alcoholRange, p.alcohol.supply.value === "sold" ? "Beer and wine" : null);
  text(F.lowAlcohol, "Low-alcohol beer");
  text(F.nonAlcoholic, "Free water, soft drinks and non-alcoholic beer");
  text(F.transport, "A marked taxi and rideshare pickup point at the park edge, and public transport information at the bar and exits.");
  text(F.responsible, section(draft, /host responsibility/i) ?? "Free water and non-alcoholic drinks at the bar, food throughout sale hours, host responsibility signage.");
  text(F.prohibited, `ID checked at the bar entrance (NZ driver licence, passport or Kiwi Access card). Service refused to anyone under 18, intoxicated, or not attending the event.${security ? ` ${security} patrol the bar area.` : ""}`);
  text(F.otherSteps, "Last drinks announced and the bar closes 30 minutes before the event ends.");
  text(F.containers, "Plastic cups and cans only. No glass.");
  text(F.water, "Free water at the bar, plus a signposted water station beside the bar and near the food.");
  text(F.nearby, "None on the event site. The bar is fenced and only open during sale hours, so no increase in alcohol-related problems is expected.");
  text(F.landUse, p.venue.councilLand.value ? `Public park (${venue}). A one-day event does not change neighbouring land use.` : "A one-day event does not change neighbouring land use.");
  text(F.staff, `${manager ? `Duty manager ${manager} on site for all sale hours. ` : ""}Bar staff briefed on host responsibility before opening, and an incident register kept at the bar.`);
  text(F.noise, `Amplified sound finishes by ${end ? fmtTime(end) : "the advertised time"}, speakers face away from homes, and levels are checked during the event.`);
  text(F.disorder, `${security ? `${security} provide security. ` : ""}Stewards patrol the bar and exits, and rubbish is collected during and after the event.`);

  // 7. Attachments EvntX prepares; 10. lodged on time
  tick(F.attachSitePlan);
  tick(F.attachConsents, !!p.venue.councilLand.value || marquee);
  tick(F.attachAmp, n > 150);
  tick(F.attachFood, (p.food.stalls.value ?? 0) > 0);
  if (date) tick(F.shortNoticeNo, (Date.parse(date) - Date.parse(today)) / 86_400_000 > 35);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const f of form.getFields()) {
    if (!(f instanceof PDFTextField)) continue;
    const long = (f.getText() ?? "").length > 80;
    if (long) f.enableMultiline();
    f.setFontSize(long ? 8 : 9);
  }
  form.updateFieldAppearances(font);
  if (flat) form.flatten();
  return pdf.save();
}

/** `extra`'s pages added after `pdf`'s. */
export async function appendPdf(pdf: Uint8Array, extra: Uint8Array): Promise<Uint8Array> {
  const out = await PDFDocument.load(pdf);
  const add = await PDFDocument.load(extra);
  for (const page of await out.copyPages(add, add.getPageIndices())) out.addPage(page);
  return out.save();
}
