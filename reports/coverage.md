# Coverage (Phase 0, before any change)

Base: `origin/main` @ `3f3a1aa` (Merge PR #4 d/workflow-ui). Spec: `docs/PRD.md`, `docs/TRD.md`, the audit prompt (wins on conflict).
Lane briefs live in `docs/lanes/*.md` (the prompt's `agents/*.md`). The golden fixture is `fixtures/demo-event.json` (the prompt's `sarah-event.json`).

Status: done · partial · missing · wrong.

## PRD functional requirements

| ID | Expected | Found | Status | Owner |
| --- | --- | --- | --- | --- |
| F1 | Email sign-in + guest, events persist per org | `app/login/page.tsx`, `app/auth/callback/route.ts`, `proxy.ts`, `lib/api/server.ts` requireOrg, `supabase/migrations/0001_init.sql` RLS | done (no automated test) | backend / tests |
| F2 | Free text up to 2,000 chars, one click | `components/describe-form.tsx`, `app/(screens)/new/page.tsx`, `POST /api/events` (Zod 10–2000) | wrong: form shows a council picker incl. Waimakariri | frontend |
| F3 | AI profile, fields tagged stated/inferred/answered, missing list | `lib/ai/profile.ts`, `POST /api/events/:id/profile`, `app/(screens)/events/[id]/profile/page.tsx` | done | ai / frontend |
| F4 | Max 3 tap follow-ups, only for missing fields that change requirements | `lib/ai/profile.ts` followUps, `app/(screens)/events/[id]/questions/page.tsx`, `/answers` | done (verify max 3 in test) | ai / tests |
| F5 | Deterministic rules → documents with reasons (CCC triggers) | `lib/rules/engine.ts`, `lib/rules/ccc.ts`, `/requirements` | done; `lib/rules/waimakariri.ts` must go | backend |
| F6 | Drafts SL application, host responsibility, H&S plan, hazard register | `lib/ai/draft.ts`, `/api/documents/:id/draft`, documents page | done (host_responsibility has rule `ccc-host-resp`; not in fixture pack) | ai |
| F7 | Checklist check, red item one-click fix | `lib/ai/check.ts`, `/check`, `/fix`, documents page | done | ai / frontend |
| F8 | Working days, 20 Dec–15 Jan excluded, legal min + recommended | `lib/deadlines/index.ts`, `/deadlines`, deadlines page | done; has Waimakariri branch to remove | backend |
| F9 | One PDF with every document | `lib/pdf/pack.tsx`, `GET /api/events/:id/export` | done (sources appendix + disclaimer present) | backend |
| F10 | SVG site plan, draggable, live checks | `components/site-plan.tsx`, `app/(screens)/events/[id]/site-plan/page.tsx` | done; **owned by a teammate, not touched in this audit** | (none, frozen) |
| F11 | Cron reminders 14 and 3 days before, demo trigger | `app/api/cron/reminders/route.ts`, `app/api/demo/reminder/route.ts`, `vercel.json` | wrong: cron emails org members, prompt allows only `REMINDER_TO` | backend |
| F12 | Eventbrite draft, locked until green, NZD, Pacific/Auckland | `app/api/events/[id]/eventbrite/route.ts`, `lib/integrations/eventbrite.ts`, deadlines page | done (lock = ready or manual) | backend / frontend |
| F13 | Source link + last-checked on every requirement and checklist | `Requirement.lastChecked`, `EventDocument.checklistSource`, `components/format.ts` | partial: verify every screen renders both | frontend |
| F14 | Likely community/commercial with reasoning, verified fees only | `lib/ai/classify.ts`, `/classify`, profile page | partial: check "varies, check with council" copy for unknown fees | ai / frontend |
| F15 | Events list, licence renewals, "run it again" | `components/home.tsx`, `app/(screens)/dashboard`, `app/(screens)/licences`, `/api/licences` | done (verify run-it-again) | frontend |
| F16 | Official PDF forms (P2) | none | missing, out of weekend scope (P2) | none |
| F17 | Committee sign-off (P2) | none | missing, out of weekend scope (P2) | none |
| F18 | Council email response (P2) | none | missing, out of weekend scope (P2) | none |
| F19 | Stallholder applications (P2) | none | missing, out of weekend scope (P2) | none |

## TRD API routes

| Route | Found | Status | Owner |
| --- | --- | --- | --- |
| GET /api/events | `app/api/events/route.ts` | done | backend |
| POST /api/events | same | partial: accepts any CouncilSlug from body; should default to ccc | backend |
| GET /api/events/:id | `app/api/events/[id]/route.ts` | done | backend |
| POST /api/events/:id/profile (+GET) | `.../profile/route.ts` | done | backend / ai |
| POST /api/events/:id/edit (not in TRD) | `.../edit/route.ts` | done (extra, used by profile edit) | backend |
| POST /api/events/:id/answers | `.../answers/route.ts` | done | backend |
| POST /api/events/:id/classify | `.../classify/route.ts` | done | backend / ai |
| POST /api/events/:id/requirements | `.../requirements/route.ts` | done | backend |
| GET /api/events/:id/documents | `.../documents/route.ts` | done | backend |
| POST /api/documents/:id/draft | `app/api/documents/[id]/draft/route.ts` | done | backend / ai |
| POST /api/documents/:id/check | `.../check/route.ts` | done | backend / ai |
| POST /api/documents/:id/fix | `.../fix/route.ts` | done | backend / ai |
| GET /api/events/:id/deadlines | `.../deadlines/route.ts` | done | backend |
| GET /api/events/:id/export | `.../export/route.ts` | done | backend |
| POST /api/events/:id/eventbrite | `.../eventbrite/route.ts` | done (409 lock, draft only) | backend |
| GET /api/licences | `app/api/licences/route.ts` | done | backend |
| POST /api/demo/reminder | `app/api/demo/reminder/route.ts` | done | backend |
| GET /api/cron/reminders | `app/api/cron/reminders/route.ts` | wrong (recipient) | backend |
| GET /auth/callback | `app/auth/callback/route.ts` | done | backend |

## TRD integrations and cross-cutting

| Item | Found | Status | Owner |
| --- | --- | --- | --- |
| structured() only, prompts in prompts.ts | `lib/ai/client.ts`, `lib/ai/prompts.ts` | done (verify) | ai |
| Models from env only | `lib/ai/client.ts:10-11` defaults `gpt-4o-mini` / `gpt-4o`; `:37` `text-embedding-3-small` | wrong | ai |
| Temperature 0 | `lib/ai/client.ts` pinnedTemperature | done | ai |
| fence() on scraped text | `lib/ai/client.ts`, callers | done (verify) | ai |
| DEMO_MODE fallback 20 s, seeded only | `lib/ai/demo.ts` | done | ai |
| MOCK=1 on every route | `lib/api/server.ts` MOCK | done (no route-level tests) | backend / tests |
| RLS per org, knowledge closed | `0001_init.sql` | done | backend |
| Eventbrite draft only, NZD, Pacific/Auckland | `lib/integrations/eventbrite.ts` | done | backend |
| Resend reminders | `lib/integrations/email.ts` | done (recipient issue in cron) | backend |
| PDF sources appendix + disclaimer every page | `lib/pdf/pack.tsx` | done (verify every page) | backend |
| Disclaimer on every screen | `app/layout.tsx:26` | done | frontend |
| Stepper on every flow screen | `components/event-steps.tsx` ("Step n of 4" text only, hidden < 640px) | partial | frontend |
| 390px layout, 44px targets, keyboard | components/* | partial (Share button 40px min-h) | frontend |
| Playwright E2E + screenshots | none | missing | tests |
| Route tests under MOCK=1 | none | missing | tests |
| Lint | no `lint` script, no ESLint | missing | orchestrator |
| Out-of-scope features | `app/(screens)/budget/page.tsx` (cost tracker, localStorage) | review: not in PRD screens; keep? see decisions | frontend |

## Waimakariri / WDC references (all must go, except the frozen 0001 migration)

| File | What |
| --- | --- |
| `lib/schemas.ts:8` | `CouncilSlug` enum value |
| `lib/rules/waimakariri.ts`, `lib/rules/index.ts:2,5` | empty rule set and import |
| `lib/deadlines/index.ts:51,108` | Waimakariri liquor source URL branch |
| `components/council.ts:7-8,33` | Waimakariri place list, label |
| `components/format.ts:21,59` | council label, source host label |
| `components/describe-form.tsx:95-96,141-142` | council picker (lists every CouncilSlug) |
| `scripts/ingest/seeds.ts:2,16-19,28`, `scripts/e2e-flow.mts:2` | seed URLs, CLI arg |
| `supabase/migrations/0001_init.sql:9,174` | check constraint + seed row (frozen file: neutralise with a new migration) |
| `tests/rules.test.ts:66-67`, `tests/deadlines.test.ts:54-60`, `tests/council.test.ts:9-10`, `tests/ai-profile.test.ts:29-34`, `tests/ai-demo.test.ts:16` | tests |
| `docs/PRD.md`, `docs/TRD.md`, `docs/lanes/*.md`, `docs/lane-a-handoff.md`, `docs/pitch-prep.md`, `README.md`, `AGENTS.md` | copy |

## Recent decisions picked up from `git log`

- UI rebuilt as Details → (Questions) → Documents → Site plan → Deadlines, with Home as dashboard (`14fe4da`, `27fc5f2`, `112bea9`).
- Organisers can type their own answer on a red checklist item (`d949a80`, `0bdd84b`).
- Eventbrite lock requires the complete required document set with covering checks (`8439ba9`, `532866f`).
- Unknown people become `[NAME TO CONFIRM]`, never invented (`88d51b9`).
- Classification falls back to `unclear` when fee bands don't settle it (`ec98f29`).
- `d/documents-ux` (2 commits ahead, plus uncommitted work in the `hostready-docs` worktree) adds a `people` schema and per-document PDFs. Its HEAD does not build without that uncommitted work, so this audit is based on `main` and leaves that branch to its owner.
