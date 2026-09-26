import { describe, expect, it } from "vitest";
import { councilFor } from "../components/council";

describe("councilFor", () => {
  it("finds the council from a place name", () => {
    expect(councilFor("Hagley Park")).toBe("ccc");
    expect(councilFor("Lyttelton main street")).toBe("ccc");
    expect(councilFor("Ōtautahi")).toBe("ccc");
    expect(councilFor("Kaiapoi Domain")).toBe("waimakariri");
    expect(councilFor("Rangiora Showgrounds")).toBe("waimakariri");
  });
  it("returns null when it doesn't know, so the UI asks", () => {
    expect(councilFor("Queenstown")).toBeNull();
    expect(councilFor("the school field")).toBeNull();
    expect(councilFor("")).toBeNull();
  });
  it("doesn't match inside other words", () => {
    expect(councilFor("Custom hall")).toBeNull(); // not "cust"
  });
});
