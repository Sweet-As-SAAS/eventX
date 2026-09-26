// Every route under MOCK=1 returns exactly the contract shape, with no network calls and no keys.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import fixture from "../fixtures/demo-event.json";
import {
  Classification, Deadline, EventbriteDraft, EventDetail, EventDocument, EventSummary, Licence, ProfileResponse, Requirement,
} from "../lib/schemas";

// The route handlers read the demo-fixed flag from cookies(). Tests set it here.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: () => {},
  }),
}));

// Only network calls are refused. @react-pdf loads its layout engine from an inline data: URL, which is not a network call.
const realFetch = globalThis.fetch;
const fetchSpy = vi.fn(async (url: string | URL | Request) => { throw new Error(`no network in MOCK tests: ${String(url)}`); });
const guardedFetch = (url: string | URL | Request, init?: RequestInit) =>
  String(url instanceof Request ? url.url : url).startsWith("data:") ? realFetch(url, init) : fetchSpy(url);
beforeEach(() => {
  vi.stubEnv("MOCK", "1");
  vi.stubEnv("DEMO_MODE", "1");
  vi.stubEnv("EVENTBRITE_DEMO_DRAFT_URL", "");
  vi.stubGlobal("fetch", guardedFetch);
  jar.clear();
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

const Id = z.object({ id: z.string() });
const Ok = z.object({ ok: z.literal(true) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (path = "/") => new Request(`http://localhost${path}`);
const post = (body: unknown, path = "/") => new Request(`http://localhost${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
async function json<T extends z.ZodType>(res: Response, schema: T, status = 200): Promise<z.infer<T>> {
  expect(res.status).toBe(status);
  return schema.parse(await res.json());
}

const hs = fixture.fixedDocument.id;
const failedItem = fixture.documents.find((d) => d.id === hs)!.checkResults!.items.find((i) => !i.pass)!;

describe("MOCK routes return the contract", () => {
  it("GET /api/events → EventSummary[]; POST → {id}; bad body → 400", async () => {
    const r = await import("../app/api/events/route");
    expect(await json(await r.GET(get(), undefined as never), z.array(EventSummary))).toHaveLength(1);
    expect(await json(await r.POST(post({ council: "ccc", description: fixture.description }), undefined as never), Id))
      .toEqual({ id: "demo" });
    expect(await json(await r.POST(post({ description: fixture.description }), undefined as never), Id)).toEqual({ id: "demo" }); // council defaults to ccc
    expect((await r.POST(post({ council: "other", description: fixture.description }), undefined as never)).status).toBe(400);
    expect((await r.POST(post({ council: "ccc", description: "short" }), undefined as never)).status).toBe(400);
  });

  it("GET /api/events/:id → EventDetail", async () => {
    const r = await import("../app/api/events/[id]/route");
    const detail = await json(await r.GET(get(), ctx("demo")), EventDetail);
    expect(detail.council).toBe("ccc");
  });

  it("GET and POST /api/events/:id/profile → ProfileResponse", async () => {
    const r = await import("../app/api/events/[id]/profile/route");
    await json(await r.GET(get(), ctx("demo")), ProfileResponse);
    await json(await r.POST(post({}), ctx("demo")), ProfileResponse);
  });

  it("POST /api/events/:id/answers → ProfileResponse; bad body → 400", async () => {
    const r = await import("../app/api/events/[id]/answers/route");
    const [q] = fixture.questions;
    const res = await json(await r.POST(post({ answers: [{ path: q.path, answer: q.options[0] }] }), ctx("demo")), ProfileResponse);
    expect(res.questions.map((x) => x.path)).not.toContain(q.path);
    expect((await r.POST(post({ answers: [] }), ctx("demo"))).status).toBe(400);
    expect((await r.POST(post({ answers: [{ path: q.path, answer: "not an option" }] }), ctx("demo"))).status).toBe(400);
  });

  it("POST /api/events/:id/edit → ProfileResponse; bad body → 400", async () => {
    const r = await import("../app/api/events/[id]/edit/route");
    const res = await json(await r.POST(post({ edits: [{ path: "name", value: "Renamed" }] }), ctx("demo")), ProfileResponse);
    expect(res.profile.name).toEqual({ value: "Renamed", source: "answered" });
    expect((await r.POST(post({ edits: [] }), ctx("demo"))).status).toBe(400);
    expect((await r.POST(post({ edits: [{ path: "peakAttendance", value: "lots" }] }), ctx("demo"))).status).toBe(400);
  });

  it("POST /api/events/:id/classify → Classification", async () => {
    const r = await import("../app/api/events/[id]/classify/route");
    await json(await r.POST(post({}), ctx("demo")), Classification);
  });

  it("POST /api/events/:id/requirements → Requirement[]", async () => {
    const r = await import("../app/api/events/[id]/requirements/route");
    expect(await json(await r.POST(post({}), ctx("demo")), z.array(Requirement))).toHaveLength(fixture.requirements.length);
  });

  it("GET /api/events/:id/documents → EventDocument[], with the fixed draft once the cookie is set", async () => {
    const r = await import("../app/api/events/[id]/documents/route");
    const before = await json(await r.GET(get(), ctx("demo")), z.array(EventDocument));
    expect(before.find((d) => d.id === hs)?.status).toBe("needs_fix");
    jar.set("hostready_demo_fixed", "1");
    const after = await json(await r.GET(get(), ctx("demo")), z.array(EventDocument));
    expect(after.find((d) => d.id === hs)?.status).toBe("ready");
  });

  it("POST /api/documents/:id/draft and /check → EventDocument", async () => {
    const draft = await import("../app/api/documents/[id]/draft/route");
    expect((await json(await draft.POST(post({}), ctx(hs)), EventDocument)).status).toBe("drafted");
    const check = await import("../app/api/documents/[id]/check/route");
    expect((await json(await check.POST(post({}), ctx(hs)), EventDocument)).status).toBe("needs_fix");
  });

  it("POST /api/documents/:id/fix → fixed EventDocument and sets the cookie; bad body → 400", async () => {
    const r = await import("../app/api/documents/[id]/fix/route");
    const res = await r.POST(post({ itemId: failedItem.itemId }), ctx(hs));
    expect((await json(res, EventDocument)).status).toBe("ready");
    expect(res.headers.get("set-cookie")).toContain("hostready_demo_fixed=1");
    expect((await r.POST(post({}), ctx(hs))).status).toBe(400);
  });

  it("GET /api/events/:id/deadlines → Deadline[] with the engine's special licence dates", async () => {
    const r = await import("../app/api/events/[id]/deadlines/route");
    const deadlines = await json(await r.GET(get(), ctx("demo")), z.array(Deadline));
    const licence = deadlines.find((d) => d.documentType === "special_licence_application")!;
    expect([licence.recommended, licence.legalMinimum]).toEqual(["2027-01-29", "2027-02-15"]);
  });

  it("GET /api/events/:id/export → application/pdf", async () => {
    const r = await import("../app/api/events/[id]/export/route");
    const res = await r.GET(get(), ctx("demo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
  }, 30_000);

  it("GET /api/licences → Licence[]", async () => {
    const r = await import("../app/api/licences/route");
    await json(await r.GET(get(), undefined as never), z.array(Licence));
  });

  it("POST /api/demo/reminder → {ok:true} without sending email", async () => {
    const r = await import("../app/api/demo/reminder/route");
    await json(await r.POST(post({}), undefined as never), Ok);
  });

  it("GET /api/cron/reminders → 401 without the bearer secret", async () => {
    const r = await import("../app/api/cron/reminders/route");
    expect((await r.GET(get(), undefined as never)).status).toBe(401); // secret unset
    vi.stubEnv("CRON_SECRET", "test-secret");
    expect((await r.GET(get(), undefined as never)).status).toBe(401);
    const wrong = new Request("http://localhost/", { headers: { authorization: "Bearer wrong" } });
    expect((await r.GET(wrong, undefined as never)).status).toBe(401);
  });
});

describe("Eventbrite draft under MOCK", () => {
  it("returns 409 until the red item is fixed, then a draft {id,url}", async () => {
    const r = await import("../app/api/events/[id]/eventbrite/route");
    const locked = await r.POST(post({}), ctx("demo"));
    expect(locked.status).toBe(409);
    expect((await locked.json()).error).toMatch(/green/i);

    jar.set("hostready_demo_fixed", "1");
    const draft = await json(await r.POST(post({}), ctx("demo")), EventbriteDraft);
    expect(draft.url).toMatch(/^https:\/\/www\.eventbrite\.com\//);
    expect(draft.url).not.toMatch(/publish/);
  });

  it("stays locked for any event other than the demo one", async () => {
    const r = await import("../app/api/events/[id]/eventbrite/route");
    jar.set("hostready_demo_fixed", "1");
    expect((await r.POST(post({}), ctx("someone-else"))).status).toBe(409);
  });

  it("rejects an invalid ticket list with 400", async () => {
    const r = await import("../app/api/events/[id]/eventbrite/route");
    expect((await r.POST(post({ tickets: [{ name: "", priceCents: -1 }] }), ctx("demo"))).status).toBe(400);
  });
});
