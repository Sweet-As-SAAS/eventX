# Independent review: audit/full-check vs main

Reviewer, read-only. Inputs: `docs/PRD.md`, `docs/TRD.md`, `reports/agents/_shared-brief.md`, `reports/coverage.md`, the 3,100-line branch diff, and the repo files needed to confirm each finding. Checks run: `npm test` (14 files, 112 tests pass), `npm run typecheck` (clean), `npm run lint` (clean). I did not run build, e2e or dev. The working tree was clean.

Verdict: the CCC-only change, the model routing, the Eventbrite lock and the reminder recipient all hold up. One blocker is a config gap the audit introduced: live retrieval now requires `OPENAI_MODEL_EMBED`, and the local `.env.local` does not set it. The rest are small.

## Findings

| # | Severity | File:line | Finding | Why it matters | Suggested fix |
| --- | --- | --- | --- | --- | --- |
| 1 | blocker | `lib/ai/client.ts:15-17,51`; `lib/ai/retrieve.ts:9`; callers `lib/ai/classify.ts:8`, `lib/ai/draft.ts:38` | `embed()` now calls `modelFor("embed")`, which throws when `OPENAI_MODEL_EMBED` is unset. The old code defaulted to `text-embedding-3-small`. The repo's `.env.local` has no non-empty `OPENAI_MODEL_EMBED` line (I checked for the key only and printed no values). I cannot see Vercel's env. | With `MOCK=0`, every classification and every document draft for a non-seeded event (a judge's own event) fails at retrieval, so the Documents step shows "Didn't finish". The seeded event is covered only when `DEMO_MODE=1`. The golden path breaks live. | Set `OPENAI_MODEL_EMBED=text-embedding-3-small` in `.env.local` and in Vercel (Production and Preview) before the freeze. It must be that model, or another with 1536 dimensions, because the existing `kb_chunks` were embedded with it. Keep the code as it is: the env-only model rule is correct. |
| 2 | should fix | `app/api/cron/reminders/route.ts:7-29` | This is the only route with no `MOCK()` branch (the others have 1 or 2 each). With `MOCK=1`, and `CRON_SECRET` and `REMINDER_TO` set, it still queries Supabase (lines 20, 26) and sends real email through Resend. `tests/routes.test.ts` covers only the 401 case. | This breaks "MOCK=1: every route returns the fixture". A MOCK preview with real env could send email and stamp live rows. The email still goes only to `REMINDER_TO`. | After the auth check, add `if (MOCK()) return ok({ sent: 0, today });` and a test for it. |
| 3 | should fix | `supabase/migrations/0003_ccc_only.sql:14-22` | The migration deletes rows: non-ccc `rules`, `checklists`, `templates`, `form_fields` and `kb_sources` (which cascades to `kb_chunks`), then `councils`. Every delete is scoped by `WHERE slug <> 'ccc'`, the migration is safe to re-run, events and organisations are moved to ccc rather than deleted, and `0001_init.sql` is unchanged (confirmed with `git diff`). It is still irreversible SQL, and the audit checklist says "no destructive SQL". | Any Waimakariri knowledge loaded on the remote project would be lost for good. `coverage.md` says Waimakariri had zero rules, so the expected loss is only the seed row. That has not been checked against the remote database. | The orchestrator should accept it explicitly in the handoff. Before anyone applies it, count the non-ccc rows in each table (expected: 1 councils row, 0 elsewhere). Nobody runs it from an agent. |
| 4 | should fix | `docs/SETUP.md:34`, `docs/SETUP.md:57` | Setup still says to paste only `0001_init.sql` ("the two council rows"). It never mentions `0002` or `0003`. The env table lists only `OPENAI_MODEL_FAST` and `OPENAI_MODEL_STRONG`. | Following the setup doc leaves the Waimakariri council row in the database and leaves `OPENAI_MODEL_EMBED` unset, which recreates finding 1. | Tell readers to run 0001, 0002 and 0003 in order, and add `OPENAI_MODEL_EMBED` to the OpenAI row. |
| 5 | should fix | `app/(screens)/events/[id]/deadlines/page.tsx:99` | The new `SourceLine` puts the requirement's `lastChecked` next to the deadline's own `sourceUrl`, which is often a different page. Example from the fixture: the site plan and H&S plan requirements cite the event-permits page (`fixtures/demo-event.json:49-50`), but their deadlines cite `conditions-for-events-on-public-land` (`lib/deadlines/index.ts:48`). Traffic cites the road-closure PDF. | The screen says "checked 26 Sep 2026" for a URL we have no check date for. That is exactly the provenance claim the brief says must be true. | Show the date only when `d.sourceUrl === req.sourceUrl`. The better fix is to add `lastChecked` to `Deadline`, filled from a `CHECKED` constant in `lib/deadlines`. That is a schema change, so it needs the orchestrator. |
| 6 | nice to have | `components/event-steps.tsx:13-16,34,60` | Both the "done" tick and the reassurance line come only from the step's position. If you jump to Deadlines from the step bar, it shows "Site plan done." and ticks the earlier steps even when nothing was done. | Mild false reassurance on a compliance tool. | Use neutral copy (for example "Site plan is next to your dates. Come back any time"), or take the done state from the status data the sidebar already loads. |
| 7 | nice to have | `app/page.tsx:28` | The landing page says "Your Eventbrite draft only unlocks once every document is ready." The real rule is ready *or manual*. The deadlines screen already says "ready or yours to handle". | Small copy mismatch with the actual lock. | Change it to "once every document is ready or marked as yours to lodge". |
| 8 | nice to have | `docs/TRD.md:44`, `docs/TRD.md:141` | The TRD still names `text-embedding-3-small` in the stack table, and its model sentence lists only `OPENAI_MODEL_FAST` and `OPENAI_MODEL_STRONG`. | The spec no longer matches the new env-only embed model. | Name `OPENAI_MODEL_EMBED` (1536 dimensions) in both places. |
| 9 | nice to have | `lib/ai/demo.ts:2`; `docs/lanes/B-knowledge.md:71`; `lib/deadlines/index.ts:58,69,106` | Stale multi-council leftovers: a comment about "the demo event switched to another council", a checklist line that says "both councils", and `council === "ccc"` guards that are now always true. None of them contains the words the grep looks for, and none can be reached from the UI. | Dead wording and dead branches. | Reword the comment and the checklist line. Leaving the guards is fine, since councils are data. |
| 10 | nice to have | `tests/routes.test.ts:127` | The test is named "…with the engine's special licence dates", but the MOCK route returns `fixture.deadlines` (`app/api/events/[id]/deadlines/route.ts:9`). Engine parity is actually proven by `tests/deadlines.test.ts:30`. | Misleading test name. The coverage itself is fine. | Rename it to "…fixture dates (engine parity in deadlines.test.ts)". |
| 11 | nice to have | `app/(screens)/events/[id]/profile/page.tsx` `ClassificationNote` | The classification reasoning is shown without the council source it cites (`citedChunkIds`). The fee line correctly says "varies, check with council". | F13 strictly covers requirements and checklists, so this is not a breach. But this is the one council-derived claim on screen with no link. | Later: resolve the cited chunk to its URL and render a `SourceLine`. |

## Eventbrite "ready or manual": acceptable

Keeping the lock as "ready or manual" is acceptable, and I agree with the decision. `documentsReadyForTicketing` (`lib/api/server.ts:141-155`) passes only when all of these hold:

- the event's documents are exactly its required set;
- every drafted type (`DRAFTED_TYPES`, `lib/schemas.ts:81`) is `ready`, has content, and has a check that covers every verified checklist item, all passing;
- the only other status allowed is `manual`, which applies to the council's own permit form, the site plan and other types EvntX does not draft, so they can never become "ready".

Requiring "ready" for those would lock Eventbrite forever. The UI states the rule honestly (deadlines page) and shows the route's 409 reason on screen. One ceiling: the site plan's own live checks do not feed the lock.

## Checked and fine

- **Waimakariri / WDC:** `grep -rniw "waimakariri\|wdc"` returns nothing, excluding `node_modules`, `.next`, `.claude`, `reports`, `.git` and `0001_init.sql`. Rangiora and Kaiapoi are also gone. `components/council.ts` and `lib/rules/waimakariri.ts` are deleted. `CouncilSlug = z.enum(["ccc"])`. There is no council picker. `DescribeForm` always sends `ccc`, and `POST /api/events` defaults to `ccc`. Seeds and the ingest CLI accept only `ccc`.
- **Models:**
  - No hardcoded model names in code; they appear only in `.env.example` values and docs.
  - `structured()` requires `"fast" | "strong"`.
  - Fast: profile, check and fix. Strong: classify, draft, draft review and ingest normalise.
  - Model names are read at call time.
  - The timing log line never contains prompt text.
- **No AI in `lib/rules` or `lib/deadlines`:** they import only types and each other. No runtime scraping: the only `fetch` in the app is `lib/api/client.ts` plus the Eventbrite and Resend integrations.
- **Deadlines:** the engine gives Fri 29 Jan 2027 (recommended) and Mon 15 Feb 2027 (legal minimum). Fixture deadlines equal the engine output (tested), and the UI renders only API data. No hardcoded dates in screens, apart from rule prose ("20 December to 15 January").
- **Fees:** the only fee copy is "varies, check with council" (profile and budget). `classify()` throws if the reasoning contains a dollar amount.
- **Eventbrite:** the integration only POSTs `/events/` and `/ticket_classes/`. There is no publish call. The route returns 409 until ready or manual, uses NZD and Pacific/Auckland, and the MOCK lock is cookie-gated.
- **Reminders:** cron and the demo route send only to `REMINDER_TO`. The organiser-email lookup was removed. With `REMINDER_TO` unset, cron sends nothing and stamps nothing.
- **MOCK and DEMO_MODE:** every route except cron (finding 2) has a MOCK branch. Route tests stub `fetch` and fail on any network call. `withDemoFallback` uses a 20 s default, applies to the seeded event only, and wraps profile, classify, draft, check, fix and Eventbrite.
- **Disclaimer:** the exact text is in the root `app/layout.tsx:26` and on every PDF page (`lib/pdf/pack.tsx`, `fixed` footer on all 3 page kinds).
- **Secrets:** no keys or tokens in the diff. `.env.local` is gitignored and untracked. Only `.env.example` is tracked.
- **SQL:** `0001_init.sql` is unchanged. `0003` covers every table with `council_id`: kb_sources, rules, templates, checklists, form_fields, organisations and events. The constraint name `councils_slug_check` matches the inline check in 0001.
- **Golden path:** Describe → Details (with the classification note) → max 3 questions (`followUps(max = 3)`, verified-rule paths only) → Documents (row source lines, checklist source, one-click Fix) → Site plan (untouched) → Deadlines (dates, PDF, reminder, Eventbrite draft) → Dashboard. It is covered by `e2e/golden-path.spec.ts` at 1280 and 390 px.
- **Accessibility:**
  - Interactive targets raised to 44 px (`min-h-11`/`size-11`). The only `size-9`/`size-10` elements left are decorative.
  - Placeholder and disabled text contrast raised to neutral-500.
  - The step bar is a labelled `nav` with `aria-current="step"`.
  - Live regions cover the AI waits, and the Eventbrite button has `aria-describedby` pointing at its reason.
  - The timeline labels no longer push past 390 px.
- **Out of scope:** no own ticketing, promo generation, sales stats, lodgement, payments or other councils. Budget was kept: it is organiser-typed amounts in localStorage, with no fees, payments or sales. It sits outside the PRD screens but is not on the banned list.
- **Site plan:** `components/site-plan.tsx` and the site-plan page are not in the diff.
- **Dependencies:** the new ones (`eslint`, `eslint-config-next`, `@playwright/test`) are dev-only and are what the lint gate and E2E need.

## Resolution (orchestrator, Phase 5)

| # | Outcome |
| --- | --- |
| 1 blocker | **Resolved locally, open for deploy.** Added `OPENAI_MODEL_EMBED=text-embedding-3-small` to the local `.env.local`, which is gitignored and was not committed. This is the model the code used before the audit, so behaviour is unchanged. `.env.example`, `docs/SETUP.md` and `docs/TRD.md` now list the variable. **Vercel still needs it (Production and Preview) before this branch deploys.** No agent can set it, so the branch stays unmerged. |
| 2 | Fixed. `app/api/cron/reminders/route.ts` returns `{ sent: 0, today }` under MOCK, after the auth check. New test in `tests/routes.test.ts`. |
| 3 | Accepted. `0003_ccc_only.sql` limits every statement with a WHERE or `on conflict`, moves events rather than deleting them, and was not run anywhere. Before applying it, count the non-ccc rows per table (expected: 1 council row, 0 elsewhere). |
| 4 | Fixed. `docs/SETUP.md` lists 0001, 0002 and 0003 in order, plus `OPENAI_MODEL_EMBED`. |
| 5 | Fixed. The Deadlines page shows a checked date only when the requirement's source URL is the same page as the deadline's. |
| 6 | Left for later (see REVIEW_REPORT "Still to do"). |
| 7 | Fixed. The landing copy now says "ready or marked as yours to lodge". |
| 8 | Fixed. The TRD names `OPENAI_MODEL_EMBED`. |
| 9 | Fixed: the comment in `lib/ai/demo.ts` and the lane B checklist line. The `council === "ccc"` checks in `lib/deadlines` stay, because they are harmless and keep the engine ready for a second council. |
| 10 | Fixed. Renamed the test. |
| 11 | Left for later. |
