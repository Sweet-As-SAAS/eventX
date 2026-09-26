# HostReady audit: review report

Branch `audit/full-check`, based on `origin/main` @ `3f3a1aa`. Unattended run, 26 Sep 2026. Nothing was pushed.

## 1. Status

**NOT MERGED.** One reviewer blocker is still open for deploy. Live retrieval now reads the embedding model from `OPENAI_MODEL_EMBED`. I set it in the local `.env.local`, but it must also be set on Vercel (Production and Preview) before this branch deploys, or every live classification and draft fails. Set it there, then merge (section 11).

## 2. At a glance

| Check | Before | After |
| --- | --- | --- |
| Unit tests (`npm test`) | 83 passing | **113 passing** (14 files) |
| Typecheck | pass | pass |
| Lint | no lint script | **pass** (ESLint added) |
| Build | pass | pass |
| E2E, golden path (Playwright, MOCK=1) | none | **pass**: desktop 9.7 s, mobile 7.2 s |
| Clean install (`npm ci`, fresh worktree) | n/a | all of the above pass |
| Open blockers | n/a | 1: set `OPENAI_MODEL_EMBED` on Vercel (deploy config, not code) |
| Golden path time | n/a | about 10 s machine time in MOCK. Live, estimated under 1 min plus taps (see 9) |
| `waimakariri` / `WDC` hits outside `reports/` | 40+ | **2, both in the frozen `0001_init.sql`**, neutralised by `0003_ccc_only.sql` |
| Secrets in diff or history | n/a | none (one fake test key, one `...` placeholder) |

## 3. What changed

**Orchestrator**

| File | What | Why |
| --- | --- | --- |
| `lib/schemas.ts` | `CouncilSlug = z.enum(["ccc"])` | CCC is the only council. Left as an enum so the contract doesn't ripple. |
| `eslint.config.mjs`, `package.json` | New `npm run lint` (eslint-config-next 16); `no-explicit-any` off | Lint gate required. Untyped Supabase rows use `any` throughout. |
| `tsconfig.json`, `.gitignore` | Exclude agent worktrees and Playwright output | Keeps checks off copies of the repo |
| `docs/*.md`, `README.md`, `AGENTS.md` | Second-council switch removed. The TRD records the CCC-only, REMINDER_TO-only and embed-env decisions. SETUP lists migrations 0001 to 0003. | Docs match the decisions |
| `app/api/cron/reminders/route.ts` | Returns `{ sent: 0 }` under MOCK | Reviewer #2: every route is mock-first |
| `app/(screens)/events/[id]/deadlines/page.tsx` | Shows a checked date only when the source URL matches | Reviewer #5: no check date for a page we never checked |
| `app/page.tsx` | Eventbrite copy says "ready or marked as yours to lodge" | Reviewer #7: copy matches the lock |

**Backend** ([note](reports/agents/backend.md))

| File | What | Why |
| --- | --- | --- |
| `lib/rules/waimakariri.ts` (deleted), `lib/rules/index.ts` | CCC rules only | CCC only |
| `lib/deadlines/index.ts` | Waimakariri branch and URL removed; CCC dates unchanged | CCC only |
| `supabase/migrations/0003_ccc_only.sql` (new, not run) | Moves non-ccc events to ccc, deletes non-ccc knowledge rows, check becomes `slug = 'ccc'` | `0001` is frozen |
| `app/api/events/route.ts`, `lib/api/client.ts` | `council` is optional, defaults to ccc; anything else is a 400 | No council picker |
| `app/api/cron/reminders/route.ts` | Sends only to `REMINDER_TO` | It used to email org members' own addresses (safety rule) |
| `lib/api/server.ts` | `loadEvent` and `loadDocument` return 404 for a non-uuid id | It used to be a Postgres 500 |
| `scripts/ingest/seeds.ts`, `scripts/e2e-flow.mts` | Waimakariri seeds and CLI argument removed | CCC only |

**AI** ([note](reports/agents/ai.md))

| File | What | Why |
| --- | --- | --- |
| `lib/ai/client.ts` | No hardcoded models. `modelFor("fast"\|"strong"\|"embed")` reads env at call time and throws if one is unset. One `[ai] name model ms` log line per call. | Models rule, timing |
| `lib/ai/check.ts`, `lib/ai/profile.ts` | Check, fix and profile use the fast model (check and profile were on strong) | Spec: fast for profile, follow-ups and checking |
| `lib/ai/classify.ts`, `lib/ai/draft.ts` | Strong model | Spec |
| `lib/ai/prompts.ts`, `scripts/ingest/normalise.ts` | Last stray prompt moved into prompts.ts | Prompts in one file |
| `.env.example` | New `OPENAI_MODEL_EMBED` | Embedding model from env |

**Frontend** ([note](reports/agents/frontend.md))

| File | What | Why |
| --- | --- | --- |
| `components/council.ts` (deleted), `components/describe-form.tsx` | No council picker and no "Where" field; one textarea with a 2,000-character counter | CCC only, F2 |
| `components/event-steps.tsx` | Stripe-style stepper on every event screen, visible at 390 px, with a reassurance line | UX decision |
| `app/(screens)/events/[id]/profile/page.tsx` | Classification shown as "Likely …" with reasoning; fee reads "varies, check with council" | F14 |
| `.../documents/page.tsx` | Source and checked date on every requirement and checklist; spinners; one main action | F13, progress states |
| `.../deadlines/page.tsx` | Eventbrite disabled with its reason; 409 message shown inline; "draft, not published"; error state instead of an endless skeleton | F12 |
| `components/sidebar.tsx`, `budget/page.tsx`, `describe-form.tsx` | 6 `set-state-in-effect` lint errors fixed properly | Lint |
| `components/ui.tsx`, `home.tsx`, `login`, `app/page.tsx` | 44 px targets, contrast raised to 4.5:1 | Accessibility |

**Tests** ([note](reports/agents/tests.md))

| File | What |
| --- | --- |
| `vitest.config.ts` (new) | `@` alias, tests/ only |
| `tests/routes.test.ts` (new) | Every route under MOCK=1 parses against its schema. Also: 400s on bad bodies, 401 on cron, Eventbrite 409 then 200, PDF starts with `%PDF-`, and no network calls |
| `tests/ai-mocked.test.ts`, `tests/ai-client.test.ts` (new) | Mocked OpenAI: profile parsing, 6 drafts in parallel (under 800 ms against 2,400 ms serial), model routing, env reads |
| `tests/deadlines.test.ts`, `tests/eventbrite.test.ts` | 29 Jan / 15 Feb 2027, liquor period, holidays, NZST, NZDT and both DST change days |
| `tests/rules.test.ts`, `tests/ai-demo.test.ts`, `tests/ai-profile.test.ts` | Everything is ccc; unverified rules never fire; 20 s fallback with fake timers |
| `tests/council.test.ts` | Deleted with `components/council.ts` |
| `playwright.config.ts`, `e2e/golden-path.spec.ts` | Sarah's flow at 1280 and 390 px, with screenshots. New devDependency: `@playwright/test` |

## 4. Requirement coverage

Full before-table: [reports/coverage.md](reports/coverage.md). Rows that changed:

| ID | Before | After |
| --- | --- | --- |
| F2 Intake | wrong (council picker) | done |
| F11 Reminders | wrong (emailed org members) | done (REMINDER_TO only) |
| F13 Sources | partial | done (requirements, checklists, deadlines) |
| F14 Classification | partial | done ("likely", reasoning, "varies" fee). Reasoning has no source link yet |
| POST /api/events | partial | done (ccc default) |
| GET /api/cron/reminders | wrong | done (+ MOCK branch) |
| Models from env | wrong | done |
| Stepper / 390 px / 44 px | partial | done |
| Route tests, E2E, lint | missing | done |
| **Still partial** | | F10 site plan: untouched, owned by a teammate. F1 auth: no automated test in real mode. F16 to F19: P2, out of weekend scope |

## 5. Decisions made without you

| # | Decision | Options | Picked and why | Check? |
| --- | --- | --- | --- | --- |
| 1 | Base branch | `d/documents-ux` (newest) or `main` | `main`. `d/documents-ux`'s HEAD doesn't build without uncommitted work in the `hostready-docs` worktree (`components/people.ts`, a schema change) | **Yes**: that branch will conflict on `lib/schemas.ts` line 8 and the documents and profile pages |
| 2 | Eventbrite lock | "ready" only, or TRD's "ready or manual" | Ready or manual. Manual documents (permit form, site plan, food licence) can never become ready, so "ready only" would lock Eventbrite forever. The reviewer agreed. | Yes |
| 3 | Profile model | strong (as it was) or fast (spec) | Fast, per the spec. Profile quality could shift | **Yes**: rerun `scripts/try-profile.ts` |
| 4 | Embedding model | keep hardcoded, or env | Env (`OPENAI_MODEL_EMBED`), set locally to the model used before | **Yes**: set it on Vercel |
| 5 | Cron recipients | org members, or REMINDER_TO | REMINDER_TO only (safety rule). Real users no longer get their own reminders | Yes, after the demo |
| 6 | Council in the DB | leave the row, or a new migration | `0003_ccc_only.sql` moves events and deletes non-ccc knowledge rows. Not run | **Yes**: count non-ccc rows before applying |
| 7 | Lint | none, `tsc` alias, or ESLint | ESLint with Next's config, `no-explicit-any` off | No |
| 8 | "Where is it?" field | keep or remove | Removed. It only existed to detect the council | No |
| 9 | Fees | show numbers or not | Always "varies, check with council": the contract has no verified fee field | No |
| 10 | Budget page | remove or keep | Kept: organiser-typed amounts only, nothing out of scope | No |
| 11 | Site plan | audit it or leave it | Left alone (teammate owns `components/site-plan.tsx` and its page) | No |
| 12 | Live timing | spend credits or not | No live calls. Used Lane A's recorded live timings plus mocked proofs | Yes, do a live run |
| 13 | Stepper "done" | real state or position | Position (the site plan isn't saved anywhere) | Nice to have |

## 6. Bugs found and fixed

| Bug | Root cause | Fix | Covered by |
| --- | --- | --- | --- |
| Cron emailed real users' addresses | Recipient looked up from memberships | Send only to `REMINDER_TO` | Code review (real mode isn't unit-tested) |
| Cron ran against Supabase and Resend under MOCK | No MOCK branch | `{ sent: 0 }` under MOCK | `tests/routes.test.ts` |
| Model names hardcoded | `??` fallbacks in `client.ts` | Env only, throws if unset | `tests/ai-client.test.ts` |
| Checking and profile on the strong model | Wrong constant | Fast model | `tests/ai-mocked.test.ts` (routing) |
| A bad event id returned 500 | uuid cast error from Postgres | Zod uuid check, 404 | Code review |
| Deadlines showed a check date for an unchecked page | Date borrowed by document type only | Match on URL too | Code review |
| Deadlines skeleton spun forever on error | Error not rendered | Error message plus a link to Details | E2E (happy path only) |
| Council picker let a user choose Waimakariri | UI listed every CouncilSlug | Removed; contract is ccc-only | `tests/rules.test.ts`, `tests/routes.test.ts` (non-ccc gives 400) |
| 6 React effect lint errors, Share button at 40 px | Effects setting state; `min-h-10` | Derived state, `useSyncExternalStore`, 44 px | `npm run lint` |

## 7. Screens

Golden path order, from `npm run e2e` (MOCK=1):

| Step | Desktop | Mobile (390 px) |
| --- | --- | --- |
| 1 Describe | [01-describe-desktop](reports/screenshots/01-describe-desktop.png) | [01-describe-mobile](reports/screenshots/01-describe-mobile.png) |
| 2 Details + classification | [02-details-desktop](reports/screenshots/02-details-desktop.png) | [02-details-mobile](reports/screenshots/02-details-mobile.png) |
| 3 Questions | [03-questions-desktop](reports/screenshots/03-questions-desktop.png) | [03-questions-mobile](reports/screenshots/03-questions-mobile.png) |
| 4 Documents, red item | [04-documents-red-desktop](reports/screenshots/04-documents-red-desktop.png) | [04-documents-red-mobile](reports/screenshots/04-documents-red-mobile.png) |
| 5 Documents, fixed | [05-documents-green-desktop](reports/screenshots/05-documents-green-desktop.png) | [05-documents-green-mobile](reports/screenshots/05-documents-green-mobile.png) |
| 6 Site plan | [06-site-plan-desktop](reports/screenshots/06-site-plan-desktop.png) | [06-site-plan-mobile](reports/screenshots/06-site-plan-mobile.png) |
| 7 Deadlines | [07-deadlines-desktop](reports/screenshots/07-deadlines-desktop.png) | [07-deadlines-mobile](reports/screenshots/07-deadlines-mobile.png) |
| 8 PDF, reminder, Eventbrite draft | [08-deadlines-done-desktop](reports/screenshots/08-deadlines-done-desktop.png) | [08-deadlines-done-mobile](reports/screenshots/08-deadlines-done-mobile.png) |
| 9 Home / dashboard | [09-home-desktop](reports/screenshots/09-home-desktop.png) | [09-home-mobile](reports/screenshots/09-home-mobile.png) |

## 8. Reviewer findings

Full list: [reports/review.md](reports/review.md). There were 11 findings: 1 blocker, 4 should fix, 6 nice to have.

- **Blocker #1** (`OPENAI_MODEL_EMBED` unset): resolved locally in `.env.local` and documented. **Vercel is still open.**
- **Should fix:**
  - #2 (cron MOCK): fixed, with a test.
  - #4 (SETUP docs): fixed.
  - #5 (wrong check date): fixed.
  - #3 (irreversible migration): accepted, with a pre-apply check.
- **Nice to have:**
  - #7, #8, #9 and #10: fixed.
  - #6 (stepper done state) and #11 (classification source link): in Still to do.

The reviewer judged the "ready or manual" Eventbrite lock correct.

## 9. Timing

Full results: [reports/timing.md](reports/timing.md).

| What | Result | Budget |
| --- | --- | --- |
| E2E MOCK, desktop / mobile | 9.7 s / 7.2 s | < 30 s |
| Profile, live (Lane A's earlier runs) | < 5 s | < 10 s |
| All drafts in parallel, live (Lane A's earlier runs) | about 11 s for 5 drafts | < 60 s |
| Parallelism, mocked | 6 drafts under 800 ms, against 2,400 ms serial | parallel |
| DEMO_MODE fallback | exactly 20 s, seeded event only | ≤ 20 s |

Nothing was re-measured live in this audit. The new `[ai] name model ms` logs make a live measurement a matter of reading the server log.

## 10. Still to do (most important for the demo first)

| # | What | Next step | Start in |
| --- | --- | --- | --- |
| 1 | `OPENAI_MODEL_EMBED` on Vercel | Set it to the model the knowledge base was embedded with (1536 dims; the old code used `text-embedding-3-small`) for Production and Preview, then merge and push | Vercel env settings |
| 2 | Re-check the profile on the fast model | Run `npx tsx --env-file=.env.local scripts/try-profile.ts 5` and compare with the fixture | `lib/ai/profile.ts` |
| 3 | Bring in `d/documents-ux` | Commit the WIP in `hostready-docs`, merge `audit/full-check` into it, and resolve `lib/schemas.ts` line 8 (keep `["ccc"]`) plus the documents and profile pages | `hostready-docs` worktree |
| 4 | Recommended dates land on Sundays in the Christmas closure (permit 3 Jan 2027; site plan and H&S plan 31 Jan) | Roll calendar-day deadlines back to the previous working day, then `npm run fixture` | `lib/deadlines/index.ts` |
| 5 | The "Fixed" toast follows you to Deadlines on mobile and covers the first card | Clear toasts on route change | `components/toast.tsx` |
| 6 | Apply migration 0003 | Count non-ccc rows per table first (expect 1 council row), then run 0003 | `supabase/migrations/0003_ccc_only.sql` |
| 7 | Live timing run | `MOCK=0`, walk the flow, and copy the `[ai]` lines into `reports/timing.md` | server log |
| 8 | Eventbrite link lost after a reload | Return the draft URL in `EventDetail` (schema change) | `lib/schemas.ts`, `app/api/events/[id]/route.ts` |
| 9 | Stepper "done" is positional | Take it from the document and deadline status the sidebar already loads | `components/event-steps.tsx` |
| 10 | Classification reasoning has no source link | Link its cited chunk's URL | profile page, `lib/ai/classify.ts` |
| 11 | Desktop sidebar background stops short on long pages | Make it full height | `components/sidebar.tsx` |

## 11. How to check it yourself

```bash
cd hostready
git checkout audit/full-check
npm ci
npx playwright install chromium
npm test && npm run typecheck && npm run lint && npm run build
npm run e2e                     # golden path, desktop + 390px, screenshots to reports/screenshots/
```

To walk it by hand in about 2 minutes: set `MOCK=1` and `DEMO_MODE=1` in `.env.local`, run `npm run dev`, then:

1. Open `localhost:3000/new` and paste the description from `fixtures/demo-event.json`. Click **Check my event**.
2. Click **Looks right**, tap an answer, then **Continue to documents**.
3. On the red row, click **Fix it**, then **Apply fix**. Click **Continue to site plan**, then **Continue to deadlines**.
4. Check you see 29 Jan and 15 Feb 2027.
5. Click **Download PDF pack**, **Send me the reminder now** and **Create Eventbrite draft**.
6. Click **Home**.

To merge once item 1 is done: `git checkout main && git pull && git merge --no-ff audit/full-check && npm test`.

Sub-agent handoff notes: [backend](reports/agents/backend.md) · [ai](reports/agents/ai.md) · [frontend](reports/agents/frontend.md) · [tests](reports/agents/tests.md) · [shared brief](reports/agents/_shared-brief.md).
