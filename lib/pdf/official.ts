// Documents the council publishes its own form for: we hand back that form, filled in, instead of our own layout.
import type { DocumentType, DraftDocument, EventProfile, Licence } from "../schemas";
import { appendPdf, fillSpecialLicence } from "./special-licence";
import { fillRiskAssessment } from "./risk-assessment";

export { appendPdf };
export const OFFICIAL_FORM: Partial<Record<DocumentType, string>> = {
  special_licence_application: "special licence application",
  hazard_register: "safety risk assessment",
};

export async function officialForm(type: DocumentType, p: EventProfile, draft: DraftDocument, licences: Licence[], today: string, flat = false) {
  if (type === "special_licence_application") return fillSpecialLicence(p, draft, licences, today, flat);
  if (type === "hazard_register") return fillRiskAssessment(p, draft, today);
  return null;
}
