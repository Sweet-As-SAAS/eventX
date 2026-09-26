import { afterEach, describe, it, expect, vi } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { EventProfile } from "../lib/schemas";
import { createEventbriteDraft, nzLocalToUtc } from "../lib/integrations/eventbrite";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function ticketingProfile() {
  const profile = EventProfile.parse(fixture.profile);
  profile.name.value = "Test event";
  profile.date.value = "2027-06-14";
  profile.startTime.value = "12:00";
  profile.endTime.value = "19:00";
  profile.peakAttendance.value = 100;
  return profile;
}

describe("NZ time to UTC", () => {
  it("handles NZDT (+13) in March", () => {
    expect(nzLocalToUtc("2027-03-14", "12:00")).toBe("2027-03-13T23:00:00Z");
  });
  it("handles NZST (+12) in June", () => {
    expect(nzLocalToUtc("2027-06-14", "12:00")).toBe("2027-06-14T00:00:00Z");
  });
  it("handles the day daylight saving starts (27 Sep 2026, 2am jumps to 3am)", () => {
    expect(nzLocalToUtc("2026-09-27", "01:00")).toBe("2026-09-26T13:00:00Z");
    expect(nzLocalToUtc("2026-09-27", "10:00")).toBe("2026-09-26T21:00:00Z");
    expect(nzLocalToUtc("2026-09-26", "23:00")).toBe("2026-09-26T11:00:00Z"); // the evening before is still NZST
  });
  it("handles the day daylight saving ends (4 Apr 2027, 3am falls back to 2am)", () => {
    expect(nzLocalToUtc("2027-04-03", "12:00")).toBe("2027-04-02T23:00:00Z");
    expect(nzLocalToUtc("2027-04-04", "12:00")).toBe("2027-04-04T00:00:00Z");
  });
  it("gives Sarah's fixture event its NZDT start and end", () => {
    expect(nzLocalToUtc(fixture.profile.date.value, fixture.profile.startTime.value!)).toBe("2027-03-13T23:00:00Z");
    expect(nzLocalToUtc(fixture.profile.date.value, fixture.profile.endTime.value!)).toBe("2027-03-14T06:00:00Z");
  });
});

describe("Eventbrite draft request", () => {
  it("creates an NZD draft with local times and free and paid ticket classes, without publishing", async () => {
    vi.stubEnv("EVENTBRITE_ORG_ID", "test-organisation");
    vi.stubEnv("EVENTBRITE_TOKEN", "test-token");
    const requests: { url: string; body: any }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(options.body)) });
      return Response.json({ id: "12345" });
    }));

    const draft = await createEventbriteDraft(ticketingProfile(), [
      { name: "Free entry", priceCents: null }, { name: "Adult entry", priceCents: 1500 },
    ]);

    expect(draft).toEqual({ id: "12345", url: "https://www.eventbrite.com/myevent?eid=12345" });
    expect(requests.map((r) => r.url)).toEqual([
      "https://www.eventbriteapi.com/v3/organizations/test-organisation/events/",
      "https://www.eventbriteapi.com/v3/events/12345/ticket_classes/",
      "https://www.eventbriteapi.com/v3/events/12345/ticket_classes/",
    ]);
    expect(requests[0].body.event).toMatchObject({
      currency: "NZD", start: { timezone: "Pacific/Auckland", utc: "2027-06-14T00:00:00Z" },
      end: { timezone: "Pacific/Auckland", utc: "2027-06-14T07:00:00Z" },
    });
    expect(requests[1].body.ticket_class).toMatchObject({ name: "Free entry", free: true });
    expect(requests[2].body.ticket_class).toMatchObject({ name: "Adult entry", free: false, cost: "NZD,1500" });
    expect(requests.every((r) => !r.url.includes("publish"))).toBe(true);
  });

  it("rejects missing event details before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const profile = ticketingProfile();
    profile.peakAttendance.value = null;
    await expect(createEventbriteDraft(profile, [{ name: "Entry", priceCents: null }]))
      .rejects.toThrow("peak attendance");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
