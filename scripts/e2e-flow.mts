// Walks the whole organiser workflow against a running server with MOCK=0, through the same `api` client the screens use.
// Usage: npx tsx --env-file=.env.local scripts/e2e-flow.mts [baseUrl]
import { createServerClient } from "@supabase/ssr";
import fixture from "../fixtures/demo-event.json" with { type: "json" };
import { api, ApiError } from "../lib/api/client";
import type { EventDocument } from "../lib/schemas";

const base = process.argv[2] ?? "http://localhost:3001";
const jar = new Map<string, string>();

// Guest sign-in exactly like /login, capturing the session cookies @supabase/ssr would set in the browser.
const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
  },
});
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => realFetch(new URL(String(input), base), {
  ...init, headers: { ...init?.headers, cookie: [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ") },
});

const t0 = Date.now();
const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
  const s = Date.now();
  try {
    const r = await fn();
    console.log(`ok   ${name} (${((Date.now() - s) / 1000).toFixed(1)}s)`);
    return r;
  } catch (e) {
    console.log(`FAIL ${name}: ${e instanceof ApiError ? `${e.status} ${e.message}` : e}`);
    throw e;
  }
};

const { error } = await supabase.auth.signInAnonymously();
if (error) throw error;
console.log(`guest signed in, ${jar.size} cookie(s)`);

const { id } = await step("createEvent", () => api.createEvent({ description: fixture.description }));
const ev = await step("getEvent", () => api.getEvent(id));
console.assert(ev.profile === null, "new event has no profile");
const built = await step("buildProfile", () => api.buildProfile(id));
console.log(`     name=${built.profile.name.value} date=${built.profile.date.value} questions=${built.questions.map((q) => q.path).join(",") || "none"}`);
await step("classify", () => api.classify(id)).then((c) => console.log(`     category=${c.category}`)).catch(() => {});
await step("getProfile", () => api.getProfile(id));
await step("editProfile", () => api.editProfile(id, [{ path: "name", value: built.profile.name.value ?? "Test event" }]));
for (const q of built.questions) await step(`answer ${q.path}=${q.options[0]}`, () => api.answer(id, [{ path: q.path, answer: q.options[0]! }]));
const reqs = await step("requirements", () => api.requirements(id));
console.log(`     ${reqs.map((r) => r.documentType).join(", ")}`);

let docs = await step("listDocuments", () => api.listDocuments(id));

// Documents screen: every pending doc drafts then checks, in parallel.
const worked = await Promise.allSettled(docs.filter((d) => d.status === "pending" || d.status === "drafted").map((d) =>
  step(`draft+check ${d.documentType}`, async () => (d.status === "drafted" ? api.check(d.id) : api.draft(d.id).then((x) => api.check(x.id))))));
const byId = new Map(worked.flatMap((w) => (w.status === "fulfilled" ? [[w.value.id, w.value] as const] : [])));
docs = docs.map((d) => byId.get(d.id) ?? d);

// Like the screen: one-click fix when the suggestion is complete, otherwise the organiser types the missing facts.
// The answers are obviously fictional test data.
const needsYou = (fix: string | null) => !fix || /\[[^\]]+\]/.test(fix);
const answer = (text: string) => `For "${text}": Jordan Tester (event lead, 021 000 0000) is responsible and has arranged it. ` +
  "Free drinking water stations, soft drinks and low-alcohol beer are available; food comes from the three on-site stalls run by club volunteers.";
await Promise.all(docs.filter((x) => x.status === "needs_fix").map(async (d) => {
  for (const item of d.checkResults!.items.filter((i) => !i.pass)) {
    if (d.checkResults!.items.find((i) => i.itemId === item.itemId)?.pass) continue;
    const text = needsYou(item.suggestedFix) ? answer(item.text) : undefined;
    d = await step(`fix ${d.documentType}/${item.itemId}${text ? " (organiser answer)" : ""}`, () => api.fix(d.id, item.itemId, text))
      .then((x) => { console.log(`     ${item.itemId} ${x.checkResults!.items.find((i) => i.itemId === item.itemId)?.pass ? "GREEN" : "still red"}`); return x; })
      .catch(() => d);
  }
  console.log(`     ${d.documentType} -> ${d.status}`);
}));
docs = await step("listDocuments (after)", () => api.listDocuments(id));
const summary = (ds: EventDocument[]) => ds.map((d) => `${d.documentType}:${d.status}`).join(" ");
console.log(`     ${summary(docs)}`);

const dls = await step("deadlines", () => api.deadlines(id));
console.log(`     ${dls.map((d) => `${d.documentType}@${d.recommended}`).join(", ")}`);
const pdf = await step("export PDF", async () => {
  const r = await fetch(api.exportUrl(id));
  if (!r.ok) throw new ApiError(r.status, await r.text());
  return r.arrayBuffer();
});
console.log(`     ${pdf.byteLength} bytes`);
await step("listEvents", () => api.listEvents());
await step("licences", () => api.licences());
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s, event ${id}`);
