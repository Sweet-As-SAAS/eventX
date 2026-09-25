// Christchurch City Council rules, hand-checked against the event permits page on 26 Sep 2026.
// These are the fallback set: rules lane B publishes to Supabase override them by id (see loadRules).
// verified: false rules never fire. Only set verified: true after reading the source yourself.
import type { Rule } from "./engine";

const PERMITS = "https://ccc.govt.nz/news-and-events/events/running-an-event/event-permits";
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
    sourceUrl: PERMITS, sourceQuote: "Bouncy castles or inflatable equipment (this is classified as 'high risk')", lastChecked: CHECKED, verified: true },
  { id: "ccc-rides", council: "ccc", condition: { path: "structures.mechanicalRides", truthy: true },
    outcome: { documentType: "amusement_device_permit", reason: "Mechanical rides need additional documentation" },
    sourceUrl: PERMITS, sourceQuote: "Mechanical rides ... additional documentation will be required", lastChecked: CHECKED, verified: true },
  { id: "ccc-traffic", council: "ccc", condition: { path: "roadOrFootpathImpact", truthy: true },
    outcome: { documentType: "traffic_management_plan", reason: "Event affects roads or footpaths" },
    sourceUrl: PERMITS, sourceQuote: "Activities affecting roads or footpaths ... you'll need a traffic management plan", lastChecked: CHECKED, verified: true },
  { id: "ccc-food", council: "ccc", condition: { path: "food.stalls", gt: 0 },
    outcome: { documentType: "food_licence_check", reason: "Food will be sold or served" },
    sourceUrl: PERMITS, sourceQuote: "Food and/or special liquor licenses", lastChecked: CHECKED, verified: true },
  { id: "ccc-special-licence", council: "ccc", condition: { path: "alcohol.supply", eq: "sold" },
    outcome: { documentType: "special_licence_application", reason: "Alcohol will be sold" },
    sourceUrl: PERMITS, sourceQuote: "Food and/or special liquor licenses", lastChecked: CHECKED, verified: true },
  // TODO(lane B): confirm host responsibility wording on the CCC alcohol licensing page, then set verified: true
  // and add host_responsibility_policy to fixtures/demo-event.json requirements + documents.
  { id: "ccc-host-resp", council: "ccc", condition: { path: "alcohol.supply", eq: "sold" },
    outcome: { documentType: "host_responsibility_policy", reason: "Submitted with a special licence application" },
    sourceUrl: "TODO", sourceQuote: "TODO", lastChecked: null, verified: false },
  // TODO(lane B): find the attendance threshold for an alcohol management plan. Do not guess.
  { id: "ccc-amp", council: "ccc", condition: { all: [{ path: "alcohol.supply", eq: "sold" }, { path: "peakAttendance", gte: 999999 }] },
    outcome: { documentType: "alcohol_management_plan", reason: "Large event with alcohol" },
    sourceUrl: "TODO", sourceQuote: "TODO", lastChecked: null, verified: false },
];
