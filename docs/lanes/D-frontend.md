# Lane D: frontend, demo driver and deploy

## Mission

You build what the judges actually see, and you drive the live demo. The winning moment is a volunteer going from a blank page to a council-ready pack in under three minutes on the deployed URL: one paragraph in, questions tapped, documents appearing with reasons and source links, a red checklist item turning green, a timeline, a PDF, an email landing, an Eventbrite draft unlocking. Every AI step takes seconds, so progress states are what make it feel fast instead of broken. Build against MOCK from minute one, so nothing on your side waits for the backend.

## Read first

`AGENTS.md` · `docs/PRD.md` (User journey, screens, demo script) · the six EvntX mockup screens (link from Ashu) · `lib/api/client.ts` (every call you'll make) · `lib/schemas.ts` (every type you'll render) · `fixtures/demo-event.json` (the data you'll see in MOCK) · `app/(screens)/new/page.tsx` (working reference pattern).

## You own / do not touch

Own: `app/(screens)/*`, `app/page.tsx`, `app/login/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/*` (create it), `public/*`.
Do not touch: `app/api/*`, `lib/*` (import types and `api` only; ask C to change `lib/api/client.ts`), `scripts/*`.

## Starting state

Already done: routes for every screen exist (`/new`, `/events/[id]/profile`, `/documents`, `/site-plan`, `/deadlines`, `/dashboard`, `/events/[id]` redirects to profile); `/new` works end to end against MOCK and shows the pattern (call `api.*`, busy state, error message); `/login` with magic link and "Try it as a guest"; the root layout has the legally required disclaimer footer; Tailwind v4 is set up. Each placeholder page lists the exact `api.*` calls it needs in a comment. With `MOCK=1`, login is skipped and every call returns fixture data in the real shape.

Not done: every screen except `/new` is a heading.

## Interfaces

You receive:
| From | What | When |
| --- | --- | --- |
| C | Vercel URL with MOCK=1 | +45m |
| C | Real routes behind the same shapes (switch a preview to `MOCK=0`) | 8pm (profile), 2am (documents) |

You deliver:
| To | What | When |
| --- | --- | --- |
| Everyone | Live URL with the full flow on MOCK | midnight |
| A | Demo run-through on the real URL, driven by you | 8am |

## Screen → data map

| Screen | On load | Actions | Types |
| --- | --- | --- | --- |
| 1 Describe `/new` | (optional) `api.listEvents()` for "start from a past event" | `api.createEvent({ council, description })` → `/events/{id}/profile` | |
| 2 Profile | `api.getEvent(id)`; if `profile` is null, `api.buildProfile(id)` (show "Reading your event…") | Tap answer → `api.answer(id, [{ path, answer }])` → `api.requirements(id)`; `api.classify(id)` in the background for the "likely community" badge | EventDetail, ProfileResponse, FollowUpQuestion, Requirement, Classification |
| 3 Documents | `api.listDocuments(id)`; for every `pending` doc, in parallel: `api.draft(docId).then(d => api.check(d.id))`, updating each card as it lands | Fix button on a failed item → `api.fix(docId, itemId)` → replace that document in state | EventDocument, CheckResult |
| 4 Site plan | `api.getEvent(id)` for the profile | Drag elements, live checks, all client side | EventProfile |
| 5 Deadlines and publish | `api.deadlines(id)`, `api.listDocuments(id)` | `<a href={api.exportUrl(id)} download>`; `api.demoReminder()`; `api.eventbrite(id)` then open `url` | Deadline, EventbriteDraft |
| 6 Dashboard | `api.listEvents()`, `api.licences()` | "Run it again" → `/new` with the old description prefilled | EventSummary, Licence |

Rules for the data: render what the API returns, never hardcode demo text. `status: "manual"` documents are listed ("You handle this one", with the reason) but never drafted. The Eventbrite button is enabled only when every document is `ready` or `manual` (the route also returns 409, show its message). Show `sourceUrl` and `lastChecked` next to every requirement and checklist ("Source: CCC event permits · checked 26 Sep 2026"): this is our answer to "why not ChatGPT", so make it visible. Field tags: `stated` / `inferred` / `answered` as small coloured chips. `ApiError.status === 401` → `router.push("/login")`.

## Tasks (stop at each gate and show the result)

1. **Plan (gate, first 45m).** Map each mockup screen to the table above. List the components you'll build (stepper, field chip, requirement row, document card, checklist item, timeline, site plan canvas). Decide styling: plain Tailwind, or run `npx shadcn@latest init` now for buttons, cards and toasts. **Gate:** show the lead the plan and the component list.
2. **Shell.** App frame with a stepper across Profile → Documents → Site plan → Deadlines for `/events/[id]/*` (an `app/(screens)/events/[id]/layout.tsx`), links to Dashboard. Works at 375px wide.
3. **Describe and Profile (to 8pm).** Restyle `/new` to the mockup (voice input optional: the Web Speech API is a few lines). Profile: highlighted phrases from the description, fields with chips, up to 3 tap questions, the live requirements list with reasons and sources, the classification badge. **Gate:** full step on MOCK, then on a `MOCK=0` preview once C says so.
4. **Documents (8pm to midnight).** Pack list with status per document, draft preview, checklist panel, one red item with "Fix with suggestion", each card showing a skeleton while drafting. **Gate:** on MOCK, the fixture's `needs_fix` document shows its red item; Fix turns it green and the status becomes Ready.
5. **Site plan (midnight to 4am, P1).** An SVG generated from whatever the profile contains: licensed area if alcohol is sold, marquees, food stalls, inflatables or rides, stage, plus first aid, exits and assembly point. Elements draggable with pointer events (`onPointerDown` / `onPointerMove` / `setPointerCapture`, works on touch). Live checks shown as a list (PRD F10): licensed area marked, at least two exits, first aid present, assembly point placed. Keep the layout in component state; no API needed.
6. **Deadlines and publish.** Timeline of `recommended` and `legalMinimum` dates, with the 20 Dec to 15 Jan liquor period shaded; reminder button ("Send me the reminder now"); PDF download; Eventbrite card locked with the reason until all green, then "Create Eventbrite draft" and a link to it. Show dates exactly as `/deadlines` returns them; never compute dates in the UI (working days and Mondayised holidays live in lib/deadlines).
7. **Dashboard.** Events list with status and date; licences and certificates with expiry, soonest first, anything under 90 days highlighted; "Run it again".
8. **Polish (4am to 8am).** A skeleton or progress line for every AI wait; error toasts that show the API's message; keyboard-reachable controls; 44px touch targets; contrast 4.5:1; phone check on the live URL, logged out and in. Rehearse the demo path until it is boring: `/login` (guest) → `/new` → the demo paragraph → answer the follow-up questions → Documents → Fix → Site plan → Deadlines → PDF → reminder → Eventbrite → Dashboard.

## Gotchas

- Import `api` from `@/lib/api/client` and types from `@/lib/schemas`. Never import `lib/api/server`, `lib/supabase/admin` or `lib/ai/*` from a client component: build breaks or secrets leak.
- Pages that fetch on load or use state are client components (`"use client"`). In a client page, read params with `const { id } = use(params)` (`import { use } from "react"`). Server pages use `await params`.
- React dev mode runs effects twice. Never fire an AI POST from a bare `useEffect` without a guard (a ref flag), or you pay for two drafts and get race conditions.
- Next.js 16 conventions differ from older tutorials; check `node_modules/next/dist/docs/` when unsure.
- `api.exportUrl()` is a URL for an `<a download>`, not a fetch.
- No hardcoded demo data in components. If MOCK shows it, the real API must be able to show it too.

## Test in isolation

`npm run dev` with `MOCK=1`: every screen works with no backend, no keys and no login. `npm run build` before every PR. Vercel preview URL on your phone.

## Done when

- [ ] The whole flow works with MOCK on and with real APIs
- [ ] No hardcoded demo data in components; everything comes from API responses
- [ ] Every AI wait has a visible progress state; every error shows a message
- [ ] Sources and last-checked dates visible on requirements and checklists
- [ ] Works on a phone; keyboard reachable; 44px targets

## First prompt to paste into your agent

> You are the frontend engineer on EvntX (lane D), building a polished, reliable demo path. Read AGENTS.md, docs/PRD.md (sections "User journey" and "Functional requirements"), docs/lanes/D-frontend.md, lib/api/client.ts, lib/schemas.ts, fixtures/demo-event.json and every file under app/. Only edit app/(screens)/, app/page.tsx, app/login/, app/layout.tsx, app/globals.css, components/ and public/. The Next.js here is version 16 with React 19, so check node_modules/next/dist/docs/ before using any Next API. The dev server runs with MOCK=1, so every api.* call returns fixture data. First, give me a plan: for each of the six screens, the components, the api.* calls, the loading and error states, and how state flows between steps. Wait for my approval before writing code.
