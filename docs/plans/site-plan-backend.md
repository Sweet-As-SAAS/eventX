# Site Plan backend: implementation plan (lane C)

Status, 26 Sep 2026: **plan only, nothing implemented.** Branch `c/site-plan-backend` was created from `origin/main` at `03aee03`. We are waiting for Ashu's frontend site layout PR to merge into `main`. Step 0 (section 17) reviews his work and may change the schema shape. Sections 6 and 14 are written so they can go straight to Ashu.

## How to resume in a new chat

1. Update the branch: `git switch c/site-plan-backend && git fetch origin && git rebase origin/main`, then `npm install && npm test && npm run typecheck`.
2. Paste this prompt:

> You are the lane C backend engineer on HostReady, working on branch `c/site-plan-backend`. Read AGENTS.md, docs/lanes/C-backend.md and docs/plans/site-plan-backend.md (the Site Plan backend plan, approved in principle).
>
> Ashu's frontend site plan work has just merged into main. **Before writing any code**, do Step 0 from the plan. Review his work: the map library, how points, areas and routes are represented (lat/lng, pixels, or Google objects), item type names, what is mocked and where, whether the UI already computes checks or counts, and whether he touched `lib/schemas.ts`, `lib/api/client.ts` or the fixture. Also check whether `a/ai-guards` has merged, since it changes the demo fixture. Confirm `npm test`, `npm run typecheck` and `npm run build` pass.
>
> Then list the changes this plan needs (schema shape, item kinds, logic to move into `lib/siteplan`) and stop for my approval. After approval, implement one step at a time: schema, `lib/siteplan` with tests, route and `client.ts`, fixture, persistence, PDF. Stop at each step's gate. Commit each step. Never edit Ashu's frontend files, never merge into main, and do not create the migration until I say so.

3. Implement one step per approval. Push after the first real commit (`git push -u origin c/site-plan-backend`) and open a **draft** PR. Deadline: Sunday 10:00 NZDT, deploy freeze 08:00.

## Repo facts this plan relies on (checked 26 Sep 2026)

| Fact | Where | Why it matters |
| --- | --- | --- |
| PRs #1 (lane C), #2 (lane B) and #3 (lane A) are merged. `main` at `03aee03`: CI green, Vercel deploy succeeded, 77 tests pass, typecheck and build pass | `gh pr list`, local run | Clean base |
| `origin/a/ai-guards` (lane A, unmerged, no PR) changes the demo event in `fixtures/demo-event.json`. A trial merge into `main` conflicts in 8 files (fixture, `lib/ai/*`, two scripts/tests). It also says Waimakariri is not demoed this weekend | `git merge-tree` | Don't add fixture `sitePlan` until it lands |
| No frontend site plan code on `main` yet. Screens other than `/new` are placeholders and there is no `components/` | `app/(screens)` | Step 0 reviews Ashu's work once merged |
| The only verified site-plan fact is CCC special licence checklist item `site-plan`: "Attaches a site plan of the area to be licensed". Quote: "A plan of the building/detailed site plan of the area to be licensed". Source: `…/Alcohol/SpecialLicence.pdf`, reviewed by lane B 26 Sep 2026 | `scripts/ingest/verified/ccc/special-licence.json` | This is the **only** council-basis check |
| Tests import `lib/*` with relative paths. `tests/checklist.test.ts` imports `lib/api/server.ts` fine. There is no `vitest.config.*`. Routes use `@/` imports | `tests/*.ts` | Route tests need a small Vitest config (Vite 8 supports `resolve.tsconfigPaths`) |
| `profile` and `classification` are `jsonb` on `events`, parsed on read by `loadEvent` | migration 0001, `lib/api/server.ts` | Precedent for one JSON object per event |
| Migrations on `main`: `0001`, `0002` | `supabase/migrations` | The next free number is `0003` |
| `client.ts` `call()` sends GET with no body and POST with a body | `lib/api/client.ts` | Saving is a POST, like `answers` |
| `@react-pdf/renderer` (already installed) has SVG primitives | `package.json` | The vector PDF page needs no new package |
| Eventbrite lock logic lives in `documentsReadyForTicketing` in `lib/api/server.ts` | PR #1 | Must stay untouched |

---

## 1. Branch

`c/site-plan-backend`, created from `origin/main` (`03aee03`) with `--no-track`. It is not pushed yet. Push with `-u` on the first commit so the branch gets its own upstream, and open a **draft** PR into `main`. Only merge it when you decide to. After Ashu's PR merges, rebase onto `origin/main` before starting.

## 2. Backend files likely to be modified

| File | Change | Approval | Phase |
| --- | --- | --- | --- |
| `lib/schemas.ts` | Append Site Plan types (section 4). No existing type changes | **Ashu** | 1 |
| `fixtures/demo-event.json` | Append a `sitePlan` key as the last key, after `a/ai-guards` lands | **Ashu** | 2 |
| `tests/contract.test.ts` | One row in the `it.each` table: `["sitePlan", SitePlan, fixture.sitePlan]` | **Ashu** | 2 |
| `lib/api/client.ts` | Two methods (section 8) | lane C | 2 |
| `lib/pdf/pack.tsx` | Optional site plan page | lane C | 5 |
| `app/api/events/[id]/export/route.ts` | Pass plan and analysis to `renderPack` | lane C | 5 |

## 3. Backend files and modules likely to be created

| File | Purpose | Phase |
| --- | --- | --- |
| `lib/siteplan/geo.ts` | Area, distance, point-in-polygon on `{lat,lng}` | 1 |
| `lib/siteplan/catalog.ts` | Kind → geometry and group data | 1 |
| `lib/siteplan/normalise.ts` | Canonical form of a plan | 1 |
| `lib/siteplan/validate.ts` | Semantic validation beyond Zod | 1 |
| `lib/siteplan/expected.ts` | Expected quantities from profile and requirements, plus placed counts | 1 |
| `lib/siteplan/checks.ts` | Red/green checks, plus the one verified council fact as data | 1 |
| `lib/siteplan/analyse.ts` | Single entry point for area, per person, counts, route lengths and checks | 1 |
| `lib/siteplan/index.ts` | Re-exports. **Browser-safe**: imports only `../schemas` | 1 |
| `tests/siteplan.test.ts` | Domain and fixture-scenario tests | 1–2 |
| `app/api/events/[id]/site-plan/route.ts` | GET and POST | 2–3 |
| `vitest.config.ts` (optional, needs agreement) | `resolve.tsconfigPaths: true` so route tests can import `@/` files | 2 |
| `tests/siteplan-route.test.ts` (optional) | MOCK route tests | 2 |
| `supabase/migrations/0003_site_plan.sql` | One nullable column. **Not created until approved** | 3 |
| `lib/siteplan/pdf.ts` | Projection to page coordinates | 5 |

---

## 4. Proposed Site Plan domain model (may change after Step 0)

Store the **raw plan the organiser drew**. Derive everything else. Coordinates are plain JSON `{lat,lng}` in WGS84 decimal degrees, the same shape as Google's `LatLngLiteral`. Never store Google SDK objects.

### Stored and transported: `SitePlan`, in `lib/schemas.ts`

```ts
// ---------- Site plan (drawn by the organiser, no AI; checked by lib/siteplan) ----------
export const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type LatLng = z.infer<typeof LatLng>;

export const SiteItemKind = z.enum([
  "stage", "licensed_area", "food_stall",                      // event items (expected from the profile / requirements)
  "exit", "first_aid", "assembly_point", "toilets",            // HostReady safety items
]);
export type SiteItemKind = z.infer<typeof SiteItemKind>;

export const SiteGeometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("point"), position: LatLng }),
  z.object({ type: z.literal("area"), ring: z.array(LatLng).min(3).max(100) }), // open ring, any winding
]);

export const SiteItem = z.object({
  id: z.string().min(1).max(64),          // generated by the frontend, stable across saves
  kind: SiteItemKind,
  label: z.string().max(80).nullable(),   // e.g. "North gate"; used in the PDF legend
  geometry: SiteGeometry,
});
export type SiteItem = z.infer<typeof SiteItem>;

export const EvacuationRoute = z.object({
  id: z.string().min(1).max(64),
  path: z.array(LatLng).min(2).max(100),  // ordered polyline, start → end
});

export const SitePlan = z.object({
  view: z.object({ center: LatLng, zoom: z.number().min(0).max(22) }).nullable(), // where to open the map; null = frontend decides
  boundary: z.array(LatLng).min(3).max(200).nullable(),                           // null = not drawn yet
  items: z.array(SiteItem).max(200),
  evacuationRoutes: z.array(EvacuationRoute).max(20),
});
export type SitePlan = z.infer<typeof SitePlan>;
```

Why this shape:
- Areas are rings, not centre plus size. Google `Polygon.getPath()` returns a ring, a rectangle is a 4-point ring, and area maths and PDF drawing both use rings directly.
- Each kind has a fixed geometry: stage and licensed_area are areas, everything else is a point. `validateSitePlan` enforces this.
- The kind list is exactly what the feature brief names. It uses `food_stall` because the profile field is `food.stalls`, and trucks count as stalls.
- Evacuation routes are drawn polylines, not computed. A straight-line route would cut through obstacles and look authoritative.
- `view` is the one non-geometry field. Without it, every reload would need to geocode the venue again.

**Left out on purpose:** capacity, density limits, toilet ratios, minimum exit counts, schema version, `updatedAt`, route kinds, route-to-exit links, rotation, colours and icons.

### Derived, never stored: `SiteAnalysis`, TypeScript types in `lib/siteplan`

```ts
type SiteCheck = {
  id: string; text: string; pass: boolean;
  basis: "council" | "hostready";
  sourceUrl: string | null; lastChecked: string | null;   // set only for basis "council"
};
type ExpectedItem = { kind: SiteItemKind; expected: number; placed: number; because: string }; // "at least `expected`"
type SiteAnalysis = {
  boundaryAreaM2: number | null;         // null until a boundary exists
  peakAttendance: number | null;         // straight from profile.peakAttendance.value
  areaPerPersonM2: number | null;        // only when both are known; no threshold, no pass/fail
  placed: Record<SiteItemKind, number>;
  expected: ExpectedItem[];
  routes: { id: string; lengthM: number }[];
  checks: SiteCheck[];
};
```

These types are not API responses under option A (section 8), so they stay out of `lib/schemas.ts`.

## 5. Map-data contract (summary; full version in section 14)

| Thing | Representation |
| --- | --- |
| Coordinate | `{ lat, lng }` in WGS84 decimal degrees. Google: `latLng.toJSON()` |
| Polygon (boundary, stage, licensed area) | Open `LatLng[]` ring, at least 3 points, any winding. A repeated closing point is accepted and stripped |
| Point item | `{ type: "point", position }` |
| Area item | `{ type: "area", ring }` |
| Evacuation route | Ordered `LatLng[]`, at least 2 points |
| IDs | Created by the frontend (`crypto.randomUUID()`), kept by the backend |
| Save | Whole plan replaces the old one. Last write wins |

## 6. Schema changes requiring Ashu's approval

**Required:** append `LatLng`, `SiteItemKind`, `SiteGeometry`, `SiteItem`, `EvacuationRoute` and `SitePlan` to `lib/schemas.ts`. This is purely additive. Also the fixture `sitePlan` key and one contract-test row.

**Questions (default if there's no answer):**
1. Kinds: the minimal seven (default), or also `marquee`, `inflatable`, `ride` and `generator`, which the profile already describes?
2. `label`: keep it (default), or drop it and have the PDF number items automatically.
3. Analysis computed in `lib/siteplan` on both client and server (default, option A), or returned by the API (option B, which needs more schema)?

**Optional later:** `EventDetail.sitePlan`, a schema version, route kinds, route-to-exit links.

**Shared, but no approval needed:** the `lib/siteplan` analysis types the frontend uses.

---

## 7. `lib/siteplan/` design

Pure, deterministic, synchronous TypeScript with relative imports and **no server imports**, so the frontend can run the same functions for live feedback. No Google Maps APIs and no AI.

| Function | Responsibility | Input → output | Tests |
| --- | --- | --- | --- |
| `ringAreaM2(ring)` | Spherical polygon area using Chamberlain–Duquette with R = 6 378 137 m (the same formula and radius as Google's `spherical.computeArea`) | `LatLng[]` → m², absolute, same for either winding | 100 m square at −43.5° is 10 000 m² ±1%. Reversed winding gives the same result. A degenerate ring gives 0 |
| `distanceM(a, b)` | Haversine distance | → metres | Known pair; zero |
| `pathLengthM(path)` | Sum of segment lengths | `LatLng[]` → metres | Yes |
| `pointInRing(p, ring)` | Ray casting on lat/lng (planar at site scale) | → `boolean` | Inside, outside, concave notch |
| `ringInRing(inner, outer)` | Every vertex of `inner` is inside `outer`. Approximate: does not detect edges crossing a concave outer ring | → `boolean` | Yes, with the limitation documented in the test |
| `SITE_ITEM_KINDS` (data) | Per kind: `label`, `geometry: "point" \| "area"`, `group: "event" \| "safety"` | `Record<SiteItemKind, …>` | Through the validate tests |
| `normaliseSitePlan(plan)` | Round to 7 dp (~1 cm). Drop a closing duplicate point. Drop consecutive duplicates. Trim labels (empty becomes null) | `SitePlan` → `SitePlan` | Each rule, plus idempotence |
| `validateSitePlan(plan)` | Checks Zod can't: kind matches geometry, rings have at least 3 distinct points and non-zero area, routes have at least 2 distinct points, ids are unique | `SitePlan` → `string[]` (empty means valid) | One test per rule, plus "fixture is valid" |
| `expectedItems(profile, requirements)` | `food_stall` × `food.stalls.value` (if > 0). `stage` if `structures.stageOver1m.value === true`. `licensed_area` if requirements include `special_licence_application`. `because` follows the field's `source` ("You said…", "We inferred…", "You answered…") | → `{kind, expected, because}[]` | Each mapping. Null or "Not sure" gives no expectation. No hardcoded demo values |
| `countPlaced(plan)` | Counts items by kind | → `Record<SiteItemKind, number>` | Yes |
| `COUNCIL_SITE_FACTS` (data) | The one verified fact, in the same style as `lib/rules/ccc.ts`: `{ id, council: "ccc", whenRequirement: "special_licence_application", kind: "licensed_area", text, sourceUrl, sourceQuote, lastChecked: "2026-09-26", verified: true }`. Lane B confirms it | data | Only `verified: true` facts with a URL and date produce `basis: "council"` |
| `siteChecks(plan, ctx)` | Red/green checks (table below) | `SitePlan, { council, profile, requirements }` → `SiteCheck[]` | Extensive |
| `analyseSitePlan(plan, ctx)` | Combines area, attendance, per-person area, placed and expected counts, route lengths and checks | → `SiteAnalysis` | Nulls when there's no boundary or attendance; composition |
| `EMPTY_SITE_PLAN` | `{ view: null, boundary: null, items: [], evacuationRoutes: [] }` | const | Parses |
| `projectSitePlan(plan, box)` (Phase 5) | Equirectangular projection fitted to a page box, preserving aspect ratio, plus a scale bar | → page-space shapes | Stays inside the box; aspect preserved; a single point doesn't break it |

### Checks (presence only, no numeric thresholds)

| id | Text | Applies when | Passes when | Basis |
| --- | --- | --- | --- | --- |
| `boundary` | Event boundary drawn | always | `boundary !== null` | hostready |
| `licensed-area` | Site plan shows the licensed area | Requirements include `special_licence_application` | At least 1 `licensed_area` | **council** where a verified fact exists (CCC), otherwise hostready |
| `expected:stage`, `expected:food_stall` | "3 of 3 food stalls placed" | Kind is in `expectedItems` | `placed >= expected` | hostready |
| `exit` | Exits marked | always | At least 1 `exit` | hostready |
| `first-aid` | First aid point marked | always | At least 1 `first_aid` | hostready |
| `assembly-point` | Assembly point marked | always | At least 1 `assembly_point` | hostready |
| `toilets` | Toilets marked | always | At least 1 `toilets` | hostready |
| `evacuation-route` | Evacuation route drawn | always | At least 1 route | hostready |
| `inside-boundary` | Stage, licensed area and food stalls are inside the boundary | Boundary exists and there is at least one such item | All inside | hostready |

"At least one" means "is it on the plan", not a minimum count. "At least two exits" appears in the PRD and lane D brief but is not verified, so it is not implemented unless Ashu decides otherwise. `areaPerPersonM2` is shown as a number, with no pass or fail.

---

## 8. API and client contract

### `app/api/events/[id]/site-plan/route.ts`

Uses the existing conventions: `handler()`, `requireOrg()` first, `parseBody()`, a `MOCK()` branch that returns the real shape, `loadEvent(id, orgId)`, `must()`, and `RouteContext<"/api/events/[id]/site-plan">`. There are no AI calls, so no `maxDuration` and no `withDemoFallback`.

| Method | Body | Returns | Behaviour | Errors |
| --- | --- | --- | --- | --- |
| `GET` | — | `SitePlan` | MOCK returns `fixture.sitePlan`. Real: `loadEvent`, then `events.site_plan` parsed with `SitePlan`, or `EMPTY_SITE_PLAN` if there is none | 401 · 404 · 500 |
| `POST` | `SitePlan` (bare) | Normalised `SitePlan` | `requireOrg` → `parseBody(SitePlan)` → `normaliseSitePlan` → `validateSitePlan` (issues become a 400) → MOCK returns the plan; real calls `loadEvent`, updates, and returns the plan | 400 · 401 · 404 · 500 |

It uses POST rather than PUT because `call()` only POSTs when there is a body, and `answers` already works this way. MOCK runs the same validation. A MOCK save doesn't survive a reload, which is how the other MOCK writes behave today. There are no per-item PATCH routes and no changes to documents, Eventbrite or requirements.

### `lib/api/client.ts`

```ts
sitePlan: (id: string) => call(SitePlan, `/api/events/${id}/site-plan`),
/** Replaces the whole plan. Returns the normalised saved plan. */
saveSitePlan: (id: string, plan: SitePlan) => call(SitePlan, `/api/events/${id}/site-plan`, plan),
```

Option B, where the route returns `{ plan, analysis }`, needs extra Zod schemas and a fixture analysis, and the frontend still needs `analyseSitePlan` while dragging. Recommendation: **option A**.

---

## 9. Fixture and mock plan

- Wait until `a/ai-guards` has merged. It changes the demo event, and editing the fixture now would add a third conflict.
- `fixtures/demo-event.json` gets a `sitePlan` for the fixture's venue:
  - `view` centred on the venue
  - a boundary
  - a licensed area ring, only if the fixture requires a special licence
  - a stage ring, only if the profile implies one
  - food stall points matching `profile.food.stalls`
  - exits, first aid, toilets and one evacuation route
  - **exactly one safety item missing**, so there is one red check that goes green when the item is placed. This mirrors the existing "exactly one `needs_fix`" contract.
- Coordinates are picked by hand on a map. They live only in the fixture and are never referenced from code or tests.
- If the demo scenario changes, redraw `sitePlan` in the same commit as the profile. Ask Ashu to add this to the AGENTS.md fixture procedure.
- Tests stay generic: the plan is valid, exactly one check fails, and placing one item of the failing kind makes everything pass.
- How the map looks in mock mode is the frontend's job. Anything visual, such as a basemap image and its bounds, stays out of `SitePlan`. MOCK never needs Supabase, OpenAI, Google or PDF rendering.

## 10. Persistence plan (Phase 3, no migration until approved)

| Data | Persist? | Why |
| --- | --- | --- |
| `view`, `boundary`, `items`, `evacuationRoutes` | **Yes**, as one JSON object | This is the organiser's drawing |
| Area, per-person area, counts, expected counts, route lengths, checks | **No**. Recalculate with `analyseSitePlan` | They depend on the profile, requirements and verified facts, which change |

- One object per event, never a row per item. Recommended: `alter table events add column site_plan jsonb;` (nullable). It is covered by the existing `member events` RLS policy, is deleted along with its event, and `loadEvent` already returns it. Parse it on read with `SitePlan`.
- Alternative: a `site_plans` table with a unique `event_id` and `updated_at`, only if timestamps are needed.
- Write with `update({ site_plan }).eq("id", id)` after `loadEvent(id, orgId)`. Adding `.eq("org_id", orgId)` as well is optional defence in depth.
- **To verify first:**
  1. Which migrations are applied on the shared Supabase project, and whether `0002` is applied.
  2. That no one else is adding `0003`.
  3. What should happen when a stored plan fails to parse: a 500 (as `profile` does today) or an empty plan.
  4. Whether last-write-wins is acceptable.

## 11. Google Maps integration boundary

| Layer | Owns | Must never |
| --- | --- | --- |
| **Frontend (Google Maps)** | Loading the Maps JS API, pan and zoom, draw and edit, markers, drag, map type, icons, colours, selection, tools, undo, dirty state, when to save, venue search, the mock basemap | Send SDK objects to the backend, or compute checks with different rules |
| **Adapter (frontend, ~10 lines)** | `latLng.toJSON()`, `polygon.getPath().getArray().map(p => p.toJSON())`, `AdvancedMarkerElement.position` → literal, `{ center: map.getCenter().toJSON(), zoom: map.getZoom() }` | |
| **`lib/siteplan` (shared, pure)** | Normalise, validate, area, counts, expectations, checks, route lengths, PDF projection | Import `google.maps`, make network calls, import server code |
| **API and DB** | Validate, normalise, store and return `SitePlan` | Call Google (no server geocoding, no Static Maps in v1) |

MOCK: the backend serves `fixture.sitePlan` and the frontend draws its mock basemap underneath the same geometry. The proposed signal for the mock basemap is that `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unset. `MOCK` itself is server-only.

## 12. PDF integration plan (Phase 5, plan only)

- Inputs: `SitePlan`, `SiteAnalysis`, the event name, and `SITE_ITEM_KINDS` labels for the legend.
- v1 is **vector only**. `projectSitePlan` produces page coordinates. `pack.tsx` draws the boundary, areas, numbered points, routes and a scale bar with react-pdf SVG primitives, then a legend and the checks, with the council check cited. It is deterministic, works in MOCK, and never calls Google.
- `PackPdf` gets an optional `sitePlan?: { plan, analysis }` prop. The page goes after the documents and before the sources, and only appears if a boundary exists. The export route reads the plan, runs `analyseSitePlan`, and passes both in. The `site_plan` document stays `manual`.
- A map image (Google Static Maps terms, cost and key, or a client-side capture) is a separate later decision. Not this weekend.

## 13. Testing plan

| Test | File | Needs network? |
| --- | --- | --- |
| Schema: valid plans parse; bad lat/lng, a 2-point ring, a 1-point route, oversize arrays and unknown kinds are rejected | `tests/siteplan.test.ts` | No |
| Geometry: area (known square, both windings, degenerate), haversine, path length, point-in-ring, ring-in-ring | same | No |
| Normalise: each rule, and idempotence | same | No |
| Validate: kind matches geometry, distinct points, zero-area ring, unique ids, route points | same | No |
| Expected vs placed: each mapping; null or "Not sure" gives nothing; `because` follows the field source | same | No |
| Checks: each row of the table. `licensed-area` is `council` for `ccc` and `hostready` otherwise. Every council check has a verified URL and date. No check depends on attendance | same | No |
| Analysis: nulls, per-person area only when both values are known, route lengths | same | No |
| Fixture scenario: the plan is valid, exactly one check fails, and one placed item fixes it | same | No |
| Fixture contract row | `tests/contract.test.ts` (one row) | No |
| MOCK route (optional; needs `vitest.config.ts`): GET returns the fixture; POST returns the normalised plan; POST with a bad plan returns 400 with a message | `tests/siteplan-route.test.ts` | No |
| Org access and real save/load round trip | **Manual gates** in Phase 3 (a second guest gets 404; save, reload, compare) | Supabase |
| Google round trip (Phase 4): a recorded plan from the real UI is valid, normalising it is idempotent, and its area is within 0.5% of Google's `computeArea` | `tests/fixtures/siteplan-google.json` | No (recorded once) |
| PDF (Phase 5): projection unit tests, plus a `renderPack` smoke test | `tests/siteplan.test.ts` | No |
| **Regression:** no existing test changes except the one contract row. The documents, Eventbrite, requirements and deadlines code is untouched (check the PR diff). `site_plan` stays `manual` (the existing contract test already enforces this) | existing | No |

## 14. Frontend/backend integration contract (for Ashu)

**The frontend sends** a `SitePlan` through `api.saveSitePlan(eventId, plan)`:

```ts
{
  view: { center: { lat, lng }, zoom } | null,
  boundary: [{ lat, lng }, …] | null,                 // open ring, ≥3 points, any winding
  items: [{
    id: "uuid", kind: "stage" | "licensed_area" | "food_stall" | "exit" | "first_aid" | "assembly_point" | "toilets",
    label: string | null,
    geometry: { type: "point", position: { lat, lng } }       // exit, first_aid, assembly_point, toilets, food_stall
            | { type: "area", ring: [{ lat, lng }, …] },      // stage, licensed_area
  }],
  evacuationRoutes: [{ id: "uuid", path: [{ lat, lng }, …] }], // ≥2 points, in order
}
```

**It gets back** the normalised `SitePlan` and should replace its local state with it. On a 400 it gets a readable message. On a 401 it should redirect to `/login`. On a 404 the event doesn't exist or isn't this organisation's.

**To load**, call `api.sitePlan(eventId)`. An empty plan has `view: null` and `boundary: null`, so the frontend picks the start position.

**For live red/green**, call `analyseSitePlan(plan, { council, profile, requirements })` from `lib/siteplan`. It is browser-safe, pure and synchronous, and all its inputs come from `api.getEvent(id)`. Render:
- `analysis.checks`: "Council requirement · source · checked {date}" when `basis === "council"`, otherwise "HostReady check"
- `analysis.expected`
- `boundaryAreaM2`, `areaPerPersonM2` and `routes[].lengthM`

Please don't reimplement the checks.

**Frontend-only state (visual):** Google Maps and styling, tools, icons and colours, selection and hover, undo, dirty state, when to save (explicit, or debounced by at least 1 s; each save replaces the whole plan), venue search, the mock basemap.

**Never send:** `google.maps.*` objects, pixel coordinates or computed checks.

## 15. Dependencies and unknowns

**Backend dependencies:** none. Zod is already installed, the geometry is about 60 lines of our own code (no turf), and react-pdf's SVG primitives are already available. Google Maps packages are the frontend's choice.

| Unknown | Owner | Blocks |
| --- | --- | --- |
| How Ashu's page represents geometry (Step 0) | Ashu | The final schema shape |
| Schema approval and the 3 questions in section 6 | Ashu | Phase 1 |
| "At least two exits" check? Default: no | Ashu | Nothing (default applies) |
| Lane B confirms the `COUNCIL_SITE_FACTS` entry | lane B | The council label |
| Frontend agrees to section 14 (importing `lib/siteplan` client-side) | Ashu | Phase 2 sign-off |
| Google: key and billing, referrer restriction, Map ID, env var names on Vercel, drawing approach (Google announced the Drawing Library deprecation in 2025; confirm its status before relying on it) | frontend (+ lane C for Vercel env) | Phase 4 |
| Venue geocoding for events without a saved plan | frontend | First-load experience only |
| Mock basemap source and licence (don't use saved Google screenshots) | frontend | Mock visuals |
| Applied migrations and a free migration number | lane C | Phase 3 |
| What to do when a stored plan fails to parse | lane C | Phase 3 |
| PDF map imagery (Static Maps terms, cost, key) | later | Phase 5 image only |
| Geometry limits: no self-intersection detection; `ringInRing` checks vertices only; no antimeridian support (fine for NZ mainland sites) | accepted | Documented in tests |

## 16. Merge-conflict risks

| File | Risk | Mitigation |
| --- | --- | --- |
| `fixtures/demo-event.json` | High until `a/ai-guards` lands (it rewrites the demo event and conflicts with `main`) | Add `sitePlan` only after it merges, as the last key |
| `lib/schemas.ts`, `lib/api/client.ts` | Medium if Ashu's frontend PR touched them | Step 0 checks. Append only |
| `tests/contract.test.ts` | Low | One `it.each` row. Everything else goes in `tests/siteplan.test.ts` |
| `lib/pdf/pack.tsx`, `export/route.ts` | Low (PR #1 is merged) | Phase 5 only |
| `package.json` / lock | Frontend only | Backend adds nothing |
| `app/(screens)/…/site-plan/*`, `components/*` | none | Never touched |
| `docs/TRD.md` API table, AGENTS.md | Lane A | Send Ashu the wording |

## 17. Step-by-step implementation order

Each step is one small commit. Its **gate** must pass before the next step starts. `npm test` and `npm run typecheck` pass at every step, and `npm run build` passes before each push.

**Step 0: after Ashu's PR merges (~35 min)**
0.1 Rebase `c/site-plan-backend` onto `origin/main` and confirm tests, typecheck and build pass.
0.2 Review Ashu's site plan page. Check the map library; how points, areas and routes are stored (lat/lng, pixels or Google objects); item names; area representation; how routes are made; where checks and counts are computed; what is mocked; whether he touched `lib/schemas.ts`, `lib/api/client.ts` or the fixture; conflicts with `a/ai-guards`.
0.3 Write a short list of changes to this plan:
  - If he already stores lat/lng, mirror his shape.
  - If he uses pixels or a canvas, the mock converts to lat/lng with a fixed reference point, and the stored plan stays lat/lng.
  - If he keeps Google objects in state, he calls `toJSON()` when saving.
  - Any logic already written in the UI moves into `lib/siteplan`.
0.4 Agree the schema and section 14 with Ashu in one conversation. **Gate:** schema approved (or the defaults accepted).

**Phase 1: domain foundation (~2 h)**
1.1 Schema in `lib/schemas.ts`, with schema tests.
1.2 `geo.ts` with tests. **Gate:** area within ±1%.
1.3 `catalog.ts`, `normalise.ts` and `validate.ts`, with tests.
1.4 `expected.ts`, `checks.ts` (`COUNCIL_SITE_FACTS`), `analyse.ts` and `index.ts`, with tests. **Gate:** the suite is green, and `lib/siteplan` imports only `../schemas`.
→ Push with `-u`, and open a draft PR.

**Phase 2: mock and backend contract (~1.5 h)**
2.1 The route (GET and POST, MOCK, validation) and the `client.ts` methods. Until the fixture exists, MOCK GET returns `EMPTY_SITE_PLAN`. **Gate:** in MOCK, `curl` shows GET works, POST normalises the plan, and a bad plan gets a 400 with a message. The build passes.
2.2 After `a/ai-guards` lands: the fixture `sitePlan`, the contract row and the scenario tests. MOCK GET switches to the fixture. **Gate:** exactly one red check, which goes green with one item.
2.3 (Optional) `vitest.config.ts` and the MOCK route tests.
2.4 Put section 14 in the PR description. Ashu swaps his mock data for `api.sitePlan` and `analyseSitePlan`.

**Phase 3: persistence (~1 h, needs the migration go-ahead)**
3.1 Verify the applied migrations. Write and apply `0003_site_plan.sql`.
3.2 Implement the real branches of GET and POST.
3.3 **Manual gates:**
  - As a guest, save, reload and get the same plan.
  - A second guest gets 404 on GET and POST.
  - An invalid body gets a 400 and the stored plan is unchanged.
  - The existing flow (profile → documents → Eventbrite lock → export) behaves as before.

**Phase 4: real map support (~30 min, with Ashu)**
4.1 Record a plan saved from the Google UI. Add a round-trip test and compare against `computeArea`.
4.2 Fix any gaps in `normalise` only.

**Phase 5: PDF (~1.5–2 h)**
5.1 `projectSitePlan` with tests.
5.2 The page in `pack.tsx`, with plan and analysis passed in from the export route. **Gate:** the MOCK download contains the site plan page, and the smoke test is green.
5.3 (Later, separate decision) Map imagery.

## 18. Cut list (in this order)

1. Map imagery in the PDF (already out for this weekend)
2. The PDF page (Phase 5). Mention it as a roadmap item instead
3. Route tests and `vitest.config.ts`. Use the manual `curl` gates
4. The `inside-boundary` check and `ringInRing`
5. Route lengths
6. The recorded Google round-trip test. Do a manual save and reload with Ashu instead
7. Persistence (Phase 3). Real mode returns `EMPTY_SITE_PLAN` and the frontend keeps its own state. Only cut this if Supabase isn't live for the demo

**Never cut:** the schema with validation and normalisation, the checks with correct council and HostReady labels, the fixture, and MOCK GET and POST.
