import { describe, expect, it } from "vitest";
import { fillPeople, personFor } from "../lib/people";
import type { People } from "../lib/schemas";

const f = (value: string | null) => ({ value, source: value ? ("answered" as const) : null });
const people: People = {
  organiser: f("Jordan Tester"), contact: f("021 000 0000, jordan@example.com"), dutyManager: f("Sam Rivers"),
  security: f("Southern Guard Security Ltd"), foodProvider: f(null), wasteCollector: f("Jordan Tester"),
};

describe("filling role gaps with the people the organiser named", () => {
  it("maps each role, specific roles before the organiser", () => {
    expect(personFor("[DUTY MANAGER NAME]", people)).toBe("Sam Rivers");
    expect(personFor("[SECURITY FIRM NAME]", people)).toBe("Southern Guard Security Ltd");
    expect(personFor("[APPLICANT NAME]", people)).toBe("Jordan Tester");
    expect(personFor("[EVENT MANAGER NAME]", people)).toBe("Jordan Tester");
    expect(personFor("[EMAIL ADDRESS]", people)).toBe("jordan@example.com");
    expect(personFor("[PHONE NUMBER]", people)).toBe("021 000 0000");
  });

  it("leaves gaps that aren't a who, and roles nobody named", () => {
    expect(personFor("[ESTIMATED WASTE AMOUNT]", people)).toBeNull();
    expect(personFor("[SECURITY STAFF RATIO]", people)).toBeNull();
    expect(personFor("[FOOD PROVIDER NAME]", people)).toBeNull();
    expect(fillPeople("[DUTY MANAGER NAME] runs the bar; [ATTACH MENUS].", people)).toBe("Sam Rivers runs the bar; [ATTACH MENUS].");
  });
});
