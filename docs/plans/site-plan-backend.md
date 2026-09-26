# Site Plan backend: implementation plan (lane C)

Status, 26 Sep 2026 evening: **revised after Step 0 and approved.** Ashu's frontend (PR #4) is merged. His site plan is an SVG canvas, not Google Maps, so the Google Maps version of this plan (commit `a322498`) is replaced by this one. Work happens in the worktree `.claude/worktrees/site-plan-backend` on branch `c/site-plan-backend`, based on `origin/main` at `3f3a1aa`.

Demo focus: **Christchurch City Council, Hagley Park.** This decides the open questions below. The code stays generic (AGENTS.md: never build around the demo event's details). The venue, crowd and items come only from the profile and the rules.

## How to resume in a new chat

1. `cd .claude/worktrees/site-plan-backend && git fetch origin && git status`, then `npm test && npm run typecheck`.
2. Paste:

> You are the lane C backend engineer on HostReady, working in the worktree `.claude/worktrees/site-plan-backend` on branch `c/site-plan-backend`. Read AGENTS.md, docs/lanes/C-backend.md and docs/plans/site-plan-backend.md (approved). Check section 9 for which step is next, do that one step, stop at its gate and commit. Never edit Ashu's frontend files (`app/(screens)/*`, `components/*`), never merge into main, and do not create the migration until I say so.

## 1. What Ashu built (Step 0 findings)

| Question | Answer |
| --- | --- |
| Map library | None. `components/site-plan.tsx` is a hand-rolled 800×500 SVG with a fixed dashed boundary 20 units in from the edge. Pointer-event drag, arrow-key moves |
| Geometry | Pixel boxes: `{ id, kind, label, x, y, w, h, placed }`, with `x, y` the top-left corner in canvas units. Rectangles, and ellipses drawn inside the box for `inflatable` and `assembly`. No lat/lng, no scale, no drawn polygons, no evacuation routes |
| Item kinds | `licensed`, `marquee`, `food`, `inflatable`, `ride`, `stage`, `generator`, `firstaid`, `exit`, `assembly` |
| Where items come from | `build(profile)` shelf-packs what the profile implies. Licensed area if `alcohol.supply` is `"sold"`. Marquees up to 6, food up to 8. Inflatable, ride, stage and generator if their flags are true. First aid always. Two exits on the boundary line. An assembly point that starts **unplaced**: that is the one red check |
| Remove and add | Delete sets `placed: false` and the item moves to a "Not on the plan yet" tray. "Add an exit" appends `exit-<timestamp>` |
| Checks | Computed in the component: licensed area marked (only if alcohol is sold), at least two exits, first aid on the plan, assembly point placed. No council or HostReady label |
| Saving | None. State lives in the component (the sidebar comment says "The site plan isn't saved yet"). Download exports the SVG client-side |
| Mocked data | None. Everything comes from `api.getEvent(id).profile` |
| Shared files | `lib/schemas.ts` and the fixture unchanged. `lib/api/client.ts` gained `getProfile`, `editProfile` and a `text` argument on `fix`, nothing for the site plan |

## 2. Decisions (the Step 0 questions, answered for a CCC/Hagley Park demo)

| # | Question | Decision |
| --- | --- | --- |
| 1 | SVG canvas or Google Maps? | **SVG canvas is final for the weekend.** No Google Maps, no lat/lng, no geocoding. A Hagley Park basemap would build the demo venue into the product, so it stays out |
| 2 | Add site plan types to `lib/schemas.ts`? | **Yes.** Three additive types that mirror Ashu's `El` and kind names exactly (section 3). No existing type changes. The user posts this in the team channel before the PR merges |
| 3 | When does the licensed-area check apply? | **When the requirements include `special_licence_application`**, so the site plan agrees with the documents list. For CCC this is the same as "alcohol is sold". It carries the verified CCC citation, so in the demo it always shows as a council requirement. The licensed-area *item* still appears when alcohol is sold, as Ashu wrote it |
| 4 | Keep "At least two exits"? | **Keep**, labelled "HostReady check". It is in PRD F10 but is not a council rule, so it never claims to be one |
| 5 | Who switches the page to the backend? | **Ashu**, in his files, from the handoff in section 7. Lane C provides the route, `client.ts` methods and `lib/siteplan` |
| 6 | Site plan page in the PDF pack? | **Yes** (step 5). CCC's special licence checklist asks for "a detailed site plan of the area to be licensed", and CCC's event permit lists a site plan. His SVG download stays as well |

## 3. Schema (append to `lib/schemas.ts`)

```ts
// ---------- Site plan (drawn by the organiser on an 800×500 canvas; laid out and checked by lib/siteplan) ----------
export const SiteItemKind = z.enum(["licensed", "marquee", "food", "inflatable", "ride", "stage", "generator", "firstaid", "exit", "assembly"]);
export type SiteItemKind = z.infer<typeof SiteItemKind>;

export const SiteItem = z.object({
  id: z.string().min(1).max(64),   // "food-0" from the layout, "exit-<timestamp>" when the organiser adds one
  kind: SiteItemKind,
  label: z.string().trim().min(1).max(80),
  x: z.number(), y: z.number(),    // top-left corner, canvas units
  w: z.number().positive(), h: z.number().positive(),
  placed: z.boolean(),             // false: in the "Not on the plan yet" tray
});
export type SiteItem = z.infer<typeof SiteItem>;

export const SitePlan = z.object({ items: z.array(SiteItem).max(100) });
export type SitePlan = z.infer<typeof SitePlan>;
```

- `SitePlan` is an object, not a bare array, so fields can be added later without breaking stored plans.
- Unplaced items are stored, so something the organiser took off the plan stays off after a reload.
- The canvas size is not stored. It is a constant in `lib/siteplan`, which Ashu imports.
- Checks are derived, never stored, and their types live in `lib/siteplan` (they are not an API response).
- No fixture key and no contract-test row: MOCK builds the layout from `fixture.profile`, the same way the `edit` route derives its MOCK answer. So there is **no dependency on `a/ai-guards`**.

## 4. `lib/siteplan/`

Pure, synchronous TypeScript. It imports only `../schemas` (browser-safe, relative imports) and contains no AI and no network calls. The page and the routes run the same code.

| File | Exports | Notes |
| --- | --- | --- |
| `layout.ts` | `SITE_CANVAS` (`{ w: 800, h: 500, edge: 20 }`), `defaultLayout(profile)`, `resolveLayout(profile, saved)` | `defaultLayout` is Ashu's `build()` moved as-is: same ids, labels, sizes, caps and packing |
| `plan.ts` | `normaliseSitePlan(plan)`, `validateSitePlan(plan)` | Normalise: round `x, y` and clamp every box inside the canvas (the same clamp as his drag). Validate: unique ids, and each box fits the canvas. Returns `string[]`, empty when valid |
| `checks.ts` | `SITE_COUNCIL_FACTS`, `siteChecks(items, { council, requirements })`, type `SiteCheck` | Section 5 |
| `index.ts` | Re-exports | |

`resolveLayout(profile, saved)` merges a saved plan with the current profile by id:
- Every item from `defaultLayout(profile)` appears. If the saved plan has the same id and kind, its `x`, `y` and `placed` win. The label and size come from the layout.
- Exits the organiser added (saved ids that are not in the layout, of kind `exit`) are kept.
- Saved items the profile no longer implies (for example a fourth food truck that was removed from the profile) are dropped.
- With nothing saved, it returns `defaultLayout(profile)`.

## 5. Checks

| id | Text | Applies when | Passes when | Basis |
| --- | --- | --- | --- | --- |
| `licensed` | Licensed area marked | Requirements include `special_licence_application` | At least 1 placed `licensed` | **council** when `SITE_COUNCIL_FACTS` has a verified fact for the event's council (CCC), otherwise hostready |
| `exits` | At least two exits | always | At least 2 placed `exit` (note: "N on the plan") | hostready |
| `firstaid` | First aid on the plan | always | At least 1 placed `firstaid` | hostready |
| `assembly` | Assembly point placed | always | At least 1 placed `assembly` | hostready |

```ts
type SiteCheck = {
  id: string; label: string; pass: boolean; note: string | null;
  basis: "council" | "hostready";
  source: { url: string; quote: string; lastChecked: string } | null; // set only for basis "council"
};
```

`SITE_COUNCIL_FACTS` holds the one verified fact, in the same style as `lib/rules/ccc.ts`: council `ccc`, requirement `special_licence_application`, kind `licensed`, the CCC special licence PDF URL, the quote "A plan of the building/detailed site plan of the area to be licensed", `lastChecked: "2026-09-26"`, `verified: true` (lane B reviewed it; see `scripts/ingest/verified/ccc/special-licence.json`, item `site-plan`). A fact without `verified: true`, a URL and a date never produces a council check.

## 6. API and client

`app/api/events/[id]/site-plan/route.ts`, using the usual conventions: `handler()`, `requireOrg()` first, `loadEvent(id, orgId)`, `parseBody()`, `must()`, and a `MOCK()` branch in the real shape. No AI, so no `maxDuration`.

| Method | Body | Returns | Behaviour | Errors |
| --- | --- | --- | --- | --- |
| `GET` | none | `SitePlan` | MOCK: `resolveLayout(fixture.profile, null)`. Real: `resolveLayout(requireProfile(ev), stored)` where `stored` is `events.site_plan` parsed with `SitePlan`, or null | 401, 404, 409 (no profile yet), 500 |
| `POST` | `SitePlan` | `SitePlan` | Parse, normalise, validate (issues become a 400). MOCK returns `resolveLayout(fixture.profile, plan)`. Real saves the normalised plan and returns the resolved layout | 400, 401, 404, 409, 500 |

Until the migration exists (step 4), the real branches work without a database column: GET returns the default layout and POST validates and echoes without saving. A MOCK save does not survive a reload, like the other MOCK writes.

`lib/api/client.ts`:
```ts
/** Site plan layout: the saved plan merged with what the profile implies. */
sitePlan: (id: string) => call(SitePlan, `/api/events/${id}/site-plan`),
/** Replaces the whole plan. Returns the saved layout. */
saveSitePlan: (id: string, plan: SitePlan) => call(SitePlan, `/api/events/${id}/site-plan`, plan),
```

## 7. Frontend handoff (for Ashu, goes in the PR description)

His files, his edits. Nothing here changes what the page looks like.
1. Load: `api.sitePlan(id)` alongside `api.getEvent(id)`, and use `plan.items` as the initial `els`. Delete `build()`, and import `SITE_CANVAS` for `W`, `H` and `EDGE`.
2. Types: `El` becomes `SiteItem` and `Kind` becomes `SiteItemKind` from `@/lib/schemas`. `LOOK` and all styling stay in the component.
3. Checks: replace the local `checks` array with `siteChecks(els, { council: ev.council, requirements: ev.requirements })` from `@/lib/siteplan`. Show "Council requirement · checked {date}" with the source link when `basis === "council"`, otherwise "HostReady check".
4. Save: call `api.saveSitePlan(id, { items: els })` on pointer-up after a drag, on place, remove and "Add an exit". Debounce by about a second. Each save replaces the whole plan.
5. Optional: the sidebar flag can use `siteChecks` instead of "the site plan isn't saved yet".

## 8. Persistence (step 4, migration only when the user says so)

- `supabase/migrations/0003_site_plan.sql`: `alter table events add column site_plan jsonb;` (nullable). It is covered by the existing `member events` RLS policy and is deleted with its event.
- Write with `update({ site_plan }).eq("id", id).eq("org_id", orgId)` after `loadEvent(id, orgId)`.
- A stored plan that fails to parse is treated as nothing saved, so the organiser gets the default layout instead of a broken page.
- Last write wins.
- Verify first: which migrations are applied on the shared Supabase project, and that nobody else has claimed `0003`.

## 9. Steps (one commit each, stop at each gate)

| Step | Work | Gate | State |
| --- | --- | --- | --- |
| 0 | Review Ashu's page, revise this plan | User approval | **done** |
| 1 | Schema in `lib/schemas.ts`, schema tests in `tests/siteplan.test.ts` | Tests and typecheck green. User posts the schema in the team channel | next |
| 2 | `lib/siteplan` (layout, plan, checks, index) with tests | Suite green. `lib/siteplan` imports only `../schemas`. `defaultLayout` matches Ashu's `build()` for varied profiles. With the fixture: exactly one red check (assembly), and placing it turns everything green. Then push with `-u` and open a **draft** PR | |
| 3 | Route (GET, POST, MOCK) and the `client.ts` methods | In MOCK, `curl` shows GET returns the layout, POST normalises it, and a bad plan gets a 400 with a message. Build passes | |
| 4 | Migration `0003` and the real save and load | Manual: save, reload, same plan. A second guest gets 404. A bad body gets a 400 and the stored plan is unchanged. The existing flow (profile, documents, Eventbrite lock, export) behaves as before | |
| 5 | PDF page: the resolved layout drawn with react-pdf SVG, plus a legend and the checks with the council one cited. The export route passes it in | The MOCK download contains the site plan page, and a `renderPack` smoke test passes | |

Deadline: Sunday 10:00 NZDT, deploy freeze 08:00.

## 10. Cut list (in this order)

1. The PDF page (step 5). Mention it as a roadmap item instead
2. The frontend's save calls, if Ashu runs out of time (the backend still ships)
3. Persistence (step 4). The real GET keeps returning the default layout

**Never cut:** the schema, `lib/siteplan` with its tests, correct council and HostReady labels, MOCK GET and POST.

## 11. Merge-conflict risks

| File | Risk | Mitigation |
| --- | --- | --- |
| `lib/schemas.ts` | Low. `a/ai-guards` does not touch it | Append only, at the end |
| `lib/api/client.ts` | Low | Two methods appended to `api` |
| `fixtures/demo-event.json` | None | Not touched |
| `lib/pdf/pack.tsx`, `export/route.ts` | Low | Step 5 only, optional prop |
| `app/(screens)/*`, `components/*` | None | Never touched by lane C |
