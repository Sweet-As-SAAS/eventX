<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HostReady: shared context for coding agents

HostReady turns a plain-English event description into a council-ready permit and liquor licence pack for New Zealand organisers, checked against council rules, with every deadline tracked. Weekend hackathon build (Saasthon, University of Canterbury). **Hard deadline: Sunday 27 Sep 2026, 10:00 NZDT. Clocks go forward at 2am Sunday. Deploy freeze 8am.**

Demo flow (the product, whatever the event): an organiser types one paragraph about their event. In under three minutes they get the list of documents the council needs and why, drafts checked against the council checklist (one red item turns green with "Fix"), a working-day timeline, a PDF pack, a reminder email that lands live, and an Eventbrite draft that only unlocks once every check is green. Christchurch City Council is the only council; councils stay data, not code.

## Demo scenario: a placeholder, not a spec

The specific demo event (who, where, what) is **not decided yet**. `fixtures/demo-event.json` holds a placeholder so MOCK mode and tests have data. Never build logic, copy, UI text, prompts, tests or defaults around that event's details (its venue, club, crowd size, alcohol, rides, dates or document ids). Build for any event any organiser could describe; read the demo event only through the fixture. To change the scenario: edit `description` and `profile` in the fixture, run `npm run fixture` (recomputes questions, requirements and deadlines with the real engines and lists which documents to add or remove), update `documents` and `fixedDocument` (exactly one `needs_fix` document, repaired by `fixedDocument`), then `npm test`.

Read next: `docs/TRD.md` (architecture, API, data), `docs/PRD.md` (product), and your lane brief in `docs/lanes/`.

## Stack (versions matter, check node_modules docs before guessing an API)

Next.js 16 App Router (Turbopack, `proxy.ts` not middleware, async `params`, global `RouteContext` / `PageProps` / `LayoutProps` types) · React 19 · TypeScript strict · Tailwind v4 · Zod 4 · openai v7 (`chat.completions.parse` + `zodResponseFormat`) · Supabase (Postgres + pgvector, Auth via `@supabase/ssr`, Storage) · @react-pdf/renderer · Resend · Eventbrite REST v3 · Vitest 5 · Node 22. Hosted on Vercel (region syd1).

## Commands

```
npm run dev          # MOCK=1 in .env.local: every route serves the fixture, no keys, no login
npm test             # vitest: rules, deadlines, NZ time, fixture contract
npm run typecheck    # next typegen && tsc --noEmit (typegen creates RouteContext/PageProps)
npm run build        # must pass before you open a PR
npm run ingest:crawl -- ccc    # lane B pipeline: crawl → extract → load → normalise → (human review) → publish
```

## Hard rules

1. **`lib/schemas.ts` is the contract.** Every AI output, API response and fixture parses against it. Frozen after the kickoff review. To change it: message the team channel, then update `fixtures/demo-event.json` in the same commit (`tests/contract.test.ts` fails otherwise).
2. **Mock-first.** Every route returns the fixture when `MOCK=1`, in exactly the shape of the real response. Keep it that way when you change a route.
3. **The app never scrapes at runtime.** AI context comes only from our Supabase knowledge base (`lib/ai/retrieve.ts`). Scraped text is wrapped with `fence()` so it is treated as data.
4. **No AI in decisions that must be right every time.** `lib/rules` (which documents) and `lib/deadlines` (dates) are pure TypeScript with tests.
5. **Only verified facts reach the screen.** Rules, checklists and fees need `verified: true`, a source URL and a quote. Unknown fee: "varies, check with council". Never invent council facts, names, fees, phone numbers or dates. Unknown means a `[PLACEHOLDER]`.
6. **Secrets stay server-side.** Only `NEXT_PUBLIC_*` reaches the browser. Never import `lib/supabase/admin.ts`, `lib/api/server.ts` or `lib/ai/*` from a `"use client"` file.
7. **Every app-table query filters by the caller's org.** Routes call `requireOrg()` first, then `loadEvent(id, orgId)` / `loadDocument(id, orgId)`. Never take an org id from the request body.
8. **Dates are `YYYY-MM-DD` strings.** Today in NZ is `nzToday()`, never `new Date().toISOString()` (that is yesterday every NZ morning). Local times convert with `nzLocalToUtc()`. Never hardcode +12/+13.
9. **AI routes export `maxDuration = 60`** and wrap live calls in `withDemoFallback(live, isSeeded(ev) ? cached : null)`.
10. **`lib/` uses relative imports** (so Vitest runs without config). `app/` may use `@/`.
11. Screens call `lib/api/client.ts` only, never `fetch` directly, and never hardcode demo data.
12. Every screen and the PDF carry the line "HostReady prepares documents. You review them and lodge them with the council. This is not legal advice." (already in the root layout and PDF).

## Where things live

| Path | What | Lane |
| --- | --- | --- |
| `lib/schemas.ts` | The contract (Zod) | A |
| `fixtures/demo-event.json` | Mocked run of the demo event; MOCK and DEMO_MODE source | A |
| `lib/ai/*` | OpenAI client, prompts, profile + questions, classify, draft, check/fix, retrieval, demo fallback | A |
| `scripts/ingest/*` | Crawl, extract, load, normalise, publish | B |
| `lib/rules/ccc.ts` | Hand-verified static rules (fallback + tests) | B |
| `lib/rules/engine.ts`, `lib/deadlines/*` | Deterministic engines | C |
| `app/api/*`, `lib/api/*`, `lib/supabase/*`, `proxy.ts`, `app/auth/*` | Routes, auth, DB access | C |
| `lib/integrations/*`, `lib/pdf/*`, `vercel.json`, `supabase/migrations/*` | Eventbrite, Resend, PDF, cron, schema | C |
| `app/(screens)/*`, `app/page.tsx`, `app/login/*`, `components/*` | All UI | D |
| `docs/*`, `README.md`, `AGENTS.md` | Plan and context | A (lead) |

Stay in your lane. Touching another lane's file needs a message to that person first. Shared files (`lib/schemas.ts`, `lib/api/client.ts`, the fixture) change only with the owner's OK.

## Git

One branch per person (`a/…`, `b/…`, `c/…`, `d/…`). Small PRs into `main`, merged the same hour. CI runs typecheck and tests; Vercel builds a preview for every PR. `main` must always deploy. No force pushes to `main`.
