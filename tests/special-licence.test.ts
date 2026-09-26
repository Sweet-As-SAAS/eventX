import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import fixture from "../fixtures/demo-event.json";
import { fillSpecialLicence } from "../lib/pdf/special-licence";
import { DraftDocument, EventProfile } from "../lib/schemas";

describe("CCC special licence form", () => {
  it("fills the council's own form from the demo event", async () => {
    const draft = DraftDocument.parse(fixture.documents.find((d) => d.documentType === "special_licence_application")!.content);
    const bytes = await fillSpecialLicence(EventProfile.parse(fixture.profile), draft, fixture.licences, "2026-09-27");
    const form = (await PDFDocument.load(bytes)).getForm();
    const text = (name: string) => form.getTextField(name).getText();
    expect(form.getFields()).toHaveLength(146); // still the CON4414 form we mapped
    expect(text("Text Field 248")).toBe("Summer Sounds Trust"); // legal name
    expect(text("Text Field 259")).toBe("Taylor Example"); // proposed manager
    expect(text("Text Field 263")).toBe("20/01/2027"); // their certificate's expiry, from Licences
    expect(text("Text Field 307")).toContain("12pm to 8:30pm"); // sale hours end 30 minutes early
    expect(form.getCheckBox("Check Box 112").isChecked()).toBe(true); // large event, over 400
    expect(form.getCheckBox("Check Box 117").isChecked()).toBe(true); // trustee
    expect(text("Text Field 329")).not.toMatch(/fictional/i); // the draft's host responsibility wording, cleaned
  });
});
