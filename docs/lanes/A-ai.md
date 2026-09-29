# Lane A: AI pipeline and pitch (Ashu, lead)

## Mission

Make the AI the reason judges believe the product. Judges score Innovation, Execution, Impact and Presentation, and the brief says AI must "meaningfully improve the outcome", not decorate it. Your outputs are what the organiser sees: a profile that understood their paragraph, one or two sharp questions, drafts that are obviously about *their* event, a checker that catches a real gap. Every one must parse against the schema every time, never invent a council fact, and fall back to the cached answer if the network dies on stage. You also own the contract everyone builds against, and the pitch.

## Read first

`AGENTS.md` · `docs/TRD.md` (AI pipeline, API contract) · `lib/schemas.ts` · `lib/ai/*` · `fixtures/demo-event.json` · `tests/contract.test.ts` · `docs/PRD.md` (demo script, "why not ChatGPT").

## You own / do not touch

Own: `lib/ai/*`, `lib/schemas.ts`, `fixtures/*`, `tests/contract.test.ts`, any new `tests/ai-*.test.ts`, `docs/*`, pitch and submission.
Do not touch without asking: `app/api/*` (C calls your functions), `scripts/ingest/*` and `lib/rules/ccc.ts` (B), UI (D), `lib/rules/engine.ts` and `lib/deadlines` (C).

## Starting state

Already done: every AI function exists and typechecks (`buildProfile`, `followUps`, `applyAnswers`, `classify`, `draftDocument`, `checkDocument`, `applyFix`, `retrieve`); prompts in one file; lazy OpenAI client (MOCK and builds work without a key); temperature pinned to 0 except for reasoning models; `fence()` for scraped text; `withDemoFallback` + `isSeeded` wired into every AI route by C's routes already; the fixture covers every screen, including one red checklist item and its fixed version; 35 tests pass.

Not done: no live OpenAI call has run yet; prompts are untuned; `followUps` question bank covers 7 paths; drafting depends on B publishing templates and checklists; `citedChunkIds` are empty in the fixture.

## Interfaces

You receive:
| From | What | When |
| --- | --- | --- |
| C | Supabase keys, migration run | +45m |
| B | `match_kb_chunks('ccc', …)` returns sensible chunks | 8pm |
| B | Verified CCC `templates` and `checklists` rows for health_safety_plan, hazard_register, waste_management_confirmation, special_licence_application (+ host_responsibility_policy once verified) | midnight |

You deliver:
| To | What | Exact interface | When |
| --- | --- | --- | --- |
| Everyone | Frozen contract | `lib/schemas.ts` + fixture, reviewed together | +45m |
| C | Profile + questions live | `buildProfile(description, council, nzToday())`, `followUps(profile, rules)`, `applyAnswers(profile, answers)` | 8pm |
| C | Drafting and checking live | `draftDocument(profile, type, { sections, checklist })`, `checkDocument(doc, items)`, `applyFix(doc, fix)` | midnight |
| C | Classification live | `classify(profile)` citing chunk ids | 4am |
| D | Nothing new: D uses fixture shapes, which your live outputs must match | | |

## Tasks (stop at each gate and show the result)

1. **Contract review (+45m, gate).** Walk the team through `lib/schemas.ts` and the fixture in 10 minutes. Collect changes, make them once, run `npm test`, then announce "schemas frozen". Any later change: message the channel, update the fixture in the same PR.
2. **OpenAI access.** Put the key in `.env.local`, check which models the event credits cover and their rate limits, set `OPENAI_MODEL_FAST` / `OPENAI_MODEL_STRONG`. Tell C the values for Vercel.
3. **Profile (to 8pm).** Write `scripts/try-profile.ts` (gitignored `data/` for outputs is fine) that runs `buildProfile(fixture.description, "ccc", "2026-09-26")` 5 times. **Gate:** every run parses, and every `stated` field in the fixture matches. Show a diff table of the 5 runs. Tune `PROFILE_SYSTEM` until safe inferences (a council park is council land) come back `inferred` and anything the description does not settle lands in `missing`, never guessed. Latency under 10 s.
4. **Follow-ups.** `followUps` must only ask about missing fields that a verified rule reads (`tests/contract.test.ts` checks this against the fixture). Add question-bank entries only for paths B's verified rules read. Max 3.
5. **Drafting (8pm to midnight).** Once B has published templates and checklists, draft the four P0 types for the demo event. **Gate:** each draft covers every checklist item, contains no name, fee, phone number or date that is not in the profile or a cited chunk, and lists its placeholders. All four in parallel in under 60 s.
6. **Checking and fix.** `checkDocument` must fail an item the draft leaves as a `[PLACEHOLDER]`, and pass after `applyFix` with the suggested fix. **Gate:** before/after JSON.
7. **Classification (midnight to 4am).** Must return a category with reasoning drawn from retrieved chunks, `citedChunkIds` non-empty. If the chunks don't settle it, `unclear` is the correct answer. Never show a fee that isn't verified.
8. **Refresh the fixture from real runs.** Replace fixture drafts and checks with your best live outputs (keep ids, statuses and exactly one red item). This is what DEMO_MODE serves on stage, so make it good. `npm test` must stay green.
9. **DEMO_MODE.** With `DEMO_MODE=1`, throttle the network (browser devtools "Offline" on the API calls, or a bad `OPENAI_API_KEY`) and confirm every AI step for the demo event returns the cached answer within 20 s. Confirm a *different* description does not get the demo data.
10. **Schema tests (4am to 8am).** `tests/ai-schema.test.ts`: 10 recorded live responses per schema parse. Record them to a JSON file, don't call OpenAI in CI.
11. **Pitch (8am to 10am).** Slides: problem (Ashburton and Featherston, verified only), the demo organiser, live demo, "why not ChatGPT" (sources + reminders + lock visible), pricing, two customer quotes, roadmap. Rehearse twice with D driving. Submit title, description, repo link; repo public or `justus-lumin` invited.

## Gotchas

- Structured outputs need every key present: use `.nullable()`, never `.optional()`, in anything the model returns. No `z.record`, no unions of objects.
- `openai` v7: `openai().chat.completions.parse(...)` with `zodResponseFormat` (already in `structured()`). Check `message.refusal`.
- gpt-5 and o-series reject `temperature: 0`; `structured()` already skips it for them.
- Always pass `nzToday()` as the reference date. UTC is yesterday every NZ morning, so "this Sunday" breaks.
- Scraped text goes inside `fence()`. Never put it in the system prompt.
- `DRAFTED_TYPES` in schemas decides what gets an AI draft. Everything else is `manual`.
- Adding host_responsibility_policy to the demo pack needs B's verified rule, then update fixture requirements, documents and deadlines together.

## Test in isolation

`npm test` (no keys). For live calls: `npx tsx --env-file=.env.local scripts/try-profile.ts`. Through the app: set `MOCK=0` locally, sign in as guest, create the demo event from `/new`.

## Done when

- [ ] Every AI output parses against `lib/schemas.ts` (10 recorded runs each)
- [ ] No fact in a draft that isn't in the profile or a cited chunk
- [ ] Temperature 0 (or model default for reasoning models), models from env vars, prompts only in `lib/ai/prompts.ts`
- [ ] DEMO_MODE fallback proven with the network off, and never serves the demo data for another event
- [ ] Pitch rehearsed twice, submission in before 10am

## First prompt to paste into your agent

> You are the AI engineer on EvntX (lane A). Read AGENTS.md, docs/TRD.md (sections "AI pipeline" and "API contract"), docs/lanes/A-ai.md, lib/schemas.ts, every file in lib/ai/, fixtures/demo-event.json and tests/contract.test.ts. Do not edit files outside lib/ai/, lib/schemas.ts, fixtures/ and tests/. First, write a short plan: what is missing or risky in profile, follow-ups, classify, draft, check and fix, and the order you'll tackle them in, file by file. Stop and wait for my approval before changing code. Then do task 3 from the brief: write scripts/try-profile.ts that runs buildProfile on the fixture description 5 times against CCC with reference date 2026-09-26, and show me a diff table against fixture.profile.
