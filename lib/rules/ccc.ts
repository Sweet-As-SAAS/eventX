// Christchurch City Council rules, hand-checked against the event permits page on 26 Sep 2026.
// These are the fallback set: rules lane B publishes to Supabase override them by id (see loadRules).
// verified: false rules never fire. Only set verified: true after reading the source yourself.
import type { Rule } from "./engine";

const PERMITS = "https://ccc.govt.nz/news-and-events/events/running-an-event/event-permits";
const PERMIT_FORM = "https://ccc.tfaforms.net/177";
const SPECIAL_LICENCE_FORM = "https://ccc.govt.nz/assets/Documents/Consents-and-Licences/business-licences-and-consents/Alcohol/SpecialLicence.pdf";
const CHECKED = "2026-09-26";
const publicOnCouncilLand = {
  all: [
    { path: "openToPublic", truthy: true },
    { path: "venue.councilLand", truthy: true },
  ],
};

export const cccRules: Rule[] = [
  { id: "ccc-permit", council: "ccc", condition: publicOnCouncilLand,
    outcome: { documentType: "event_permit_application", reason: "Public event on council land" },
    sourceUrl: PERMITS, sourceQuote: "Open to the general public ... and to be held on public land", lastChecked: CHECKED, verified: true },
  { id: "ccc-site-plan", council: "ccc", condition: publicOnCouncilLand,
    outcome: { documentType: "site_plan", reason: "Required with every event permit application" },
    sourceUrl: PERMITS, sourceQuote: "Site plan", lastChecked: CHECKED, verified: true },
  { id: "ccc-hs-plan", council: "ccc", condition: publicOnCouncilLand,
    outcome: { documentType: "health_safety_plan", reason: "Required with every event permit application" },
    sourceUrl: PERMITS, sourceQuote: "Health and safety management plan", lastChecked: CHECKED, verified: true },
  { id: "ccc-waste", council: "ccc", condition: publicOnCouncilLand,
    outcome: { documentType: "waste_management_confirmation", reason: "Required with every event permit application" },
    sourceUrl: PERMITS, sourceQuote: "Waste management plan confirmation", lastChecked: CHECKED, verified: true },
  { id: "ccc-marquee", council: "ccc", condition: { path: "structures.largestMarqueeSqm", gt: 100 },
    outcome: { documentType: "building_consent_exemption", reason: "Marquee larger than 100 sqm" },
    sourceUrl: PERMITS, sourceQuote: "A marquee larger than 100sqm (requires a building consent exemption)", lastChecked: CHECKED, verified: true },
  { id: "ccc-inflatable", council: "ccc", condition: { path: "structures.inflatables", truthy: true },
    outcome: { documentType: "hazard_register", reason: "Bouncy castles and inflatables are classed as high risk" },
    sourceUrl: PERMITS, sourceQuote: "Bouncy castles or inflatable equipment (this is classified as ‘high risk’ and must follow health and safety requirements).", lastChecked: CHECKED, verified: true },
  { id: "ccc-rides", council: "ccc", condition: { path: "structures.mechanicalRides", truthy: true },
    outcome: { documentType: "amusement_device_permit", reason: "Mechanical rides need additional documentation" },
    sourceUrl: PERMITS, sourceQuote: "Mechanical rides ... additional documentation will be required", lastChecked: CHECKED, verified: true },
  { id: "ccc-traffic", council: "ccc", condition: { path: "roadOrFootpathImpact", truthy: true },
    outcome: { documentType: "traffic_management_plan", reason: "Event affects roads or footpaths" },
    sourceUrl: PERMITS, sourceQuote: "Activities affecting roads or footpaths (like races or events that increase traffic – you’ll need a traffic management plan).", lastChecked: CHECKED, verified: true },
  { id: "ccc-food", council: "ccc", condition: { path: "food.stalls", gt: 0 },
    outcome: { documentType: "food_licence_check", reason: "Food will be sold or served" },
    sourceUrl: PERMITS, sourceQuote: "Food and/or special liquor licenses", lastChecked: CHECKED, verified: true },
  { id: "ccc-special-licence", council: "ccc", condition: { path: "alcohol.supply", eq: "sold" },
    outcome: { documentType: "special_licence_application", reason: "Alcohol will be sold" },
    // The form also requires one for ticketed events where alcohol is consumed; needs a ticketed field in EventProfile (lane A).
    sourceUrl: PERMIT_FORM, sourceQuote: "A Special Licence is required if alcohol will be sold or if the event is ticketed, and alcohol will be consumed at the event.", lastChecked: CHECKED, verified: true },
  // Checked 26 Sep 2026: CCC requires a written host responsibility policy of *licensed premises*, not of special licence
  // applicants (host-responsibility-and-alcohol-promotions page; not in the SpecialLicence.pdf attachment list). Leave unverified.
  { id: "ccc-host-resp", council: "ccc", condition: { path: "alcohol.supply", eq: "sold" },
    outcome: { documentType: "host_responsibility_policy", reason: "Submitted with a special licence application" },
    sourceUrl: "TODO", sourceQuote: "TODO", lastChecked: null, verified: false },
  // ponytail: peakAttendance stands in for "expected guests"; a total-attendance field would be more exact.
  { id: "ccc-amp", council: "ccc", condition: { all: [{ path: "alcohol.supply", eq: "sold" }, { path: "peakAttendance", gt: 150 }] },
    outcome: { documentType: "alcohol_management_plan", reason: "Special licence event expecting more than 150 guests" },
    sourceUrl: SPECIAL_LICENCE_FORM, sourceQuote: "Alcohol Management Plan if the number of expected guests exceeds 150", lastChecked: CHECKED, verified: true },
];
