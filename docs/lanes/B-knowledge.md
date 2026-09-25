# Lane B: council knowledge base

## Mission

You make HostReady trustworthy. The answer to the judges' hardest question ("why not just ask ChatGPT?") is that we keep the council's actual rules, with a source and a last-checked date on every one. Your verified rules decide which documents an event needs; your templates and checklists shape every draft and every red/green check. A wrong rule or fee on screen in front of judges is the worst failure this product can have, so accuracy beats coverage: ten rules you checked by hand beat fifty the AI guessed. You also deliver the "councils are data, not code" moment by loading Waimakariri.

## Read first

`AGENTS.md` · `docs/TRD.md` ("Knowledge ingestion", "Data model") · `scripts/ingest/*` · `supabase/migrations/0001_init.sql` · `lib/rules/ccc.ts` and `lib/rules/engine.ts` (condition format) · `lib/schemas.ts` (EventProfile paths, DocumentType).

## You own / do not touch

Own: `scripts/ingest/*`, `lib/rules/ccc.ts`, `lib/rules/waimakariri.ts`, `data/` (gitignored, local only), `supabase/seed/*` if you add demo seed data.
Do not touch: `lib/rules/engine.ts` (C), `lib/schemas.ts` (A: ask if you need a new profile field or document type), `app/*`, `lib/ai/*`.

## Starting state

Already done: the full pipeline (`crawl → extract → load → normalise → publish`) runs from npm scripts; crawl obeys robots.txt at 1 req/s, depth 2, keyword-filtered; extract handles HTML (nav/footer stripped, headings kept), PDF (pdf-parse v2) and DOCX; load chunks by heading, embeds in batches, uploads raw files to the `kb` bucket (the migration creates it); normalise outputs candidates with source quotes, all unverified; publish only pushes items marked `"verified": true` and stamps `last_checked`. Ten CCC rules are hand-verified in `lib/rules/ccc.ts` from the permits page. The app merges your published rules over these by id, per council.

Not done: USER_AGENT contact email; robots/terms check; no crawl has run; Waimakariri has one seed URL and zero rules; host responsibility and alcohol management plan rules are unverified TODOs; no templates or checklists are published, so drafting and checking can't run live yet (A and C are waiting on you for these).

## Interfaces

You receive:
| From | What | When |
| --- | --- | --- |
| C | Supabase URL + service role key (for `.env.local`), migration run | +45m |
| A | OpenAI key (normalise and load need it) | +45m |

You deliver:
| To | What | Exact interface | When |
| --- | --- | --- | --- |
| A | CCC chunks searchable | `kb_chunks` rows; `select * from match_kb_chunks('ccc', <embedding>, 5)` returns relevant text for "special licence host responsibility" | 8pm |
| A, C | CCC templates | `templates` row per drafted type: `sections` = ordered headings from the council's own template (e.g. the CCC H&S plan template on the event resources page) | midnight |
| A, C | CCC checklists | `checklists` row per drafted type, `verified = true`, items `[{id, text, sourceQuote}]`, `source_url`, `last_checked` | midnight |
| C | CCC rules | `rules` rows `verified = true` with exact `source_quote` (and/or updates to `lib/rules/ccc.ts`) | midnight |
| Everyone | Waimakariri | Same three tables for `waimakariri`, plus `lib/rules/waimakariri.ts` static rules | 4am |
| A | Fees | Only confirmed fees, with source; everything else "varies, check with council" | 4am |

Drafted types that need a template and a checklist: `health_safety_plan`, `hazard_register`, `waste_management_confirmation`, `special_licence_application`, and `host_responsibility_policy` once you verify the rule.

## Tasks (stop at each gate and show the result)

1. **Plan (gate, first 45m).** Read the terms of use and copyright pages on ccc.govt.nz and waimakariri.govt.nz, and both robots.txt files. Put your email in `USER_AGENT` in `scripts/ingest/seeds.ts`. On waimakariri.govt.nz use the site search for "events", "event permit", "special licence", "alcohol licensing", "road closure", "parks booking", "fees and charges" and add the relevant pages to `SEEDS.waimakariri`. Search by name, never "WDC" (that is Whangārei). **Gate:** show the lead both seed lists and a one-line terms summary.
2. **Crawl and extract CCC.** `npm run ingest:crawl -- ccc` then `npm run ingest:extract -- ccc`. **Gate:** `data/raw/ccc/manifest.json` includes the permits page, event resources and the H&S template, and the `data/text/ccc/*.md` files read cleanly (open three).
3. **Load CCC.** `npm run ingest:load -- ccc`. **Gate:** in the Supabase SQL editor, the count of `kb_chunks` is sensible (tens to low hundreds), and A confirms retrieval returns relevant chunks.
4. **Normalise and review CCC (8pm to midnight).** `npm run ingest:normalise -- ccc`. Open every JSON in `data/normalised/ccc/` next to the live page. For each rule, checklist, template, lead time and fee: is it actually stated? Is the quote exact? Is the condition right (`{"path":"structures.largestMarqueeSqm","gt":100}`)? Add `"verified": true` only to items you confirmed. Delete wrong ones. Write templates by hand from the council's own document if the AI's section list is off. **Gate:** show the lead the verified list.
5. **Publish CCC.** `npm run ingest:publish -- ccc`, then `npm test`. **Gate:** tests green, the demo event's requirements still match `fixtures/demo-event.json`. If a published rule changes the demo event's list on purpose, tell A so the fixture is updated in the same PR.
6. **Close the CCC TODOs.** In `lib/rules/ccc.ts`: host responsibility (confirm on the CCC alcohol licensing / District Licensing Committee page that a host responsibility policy goes with a special licence, set the exact quote and URL, `verified: true`); alcohol management plan threshold (find the real number or leave it unverified; never guess). Confirm CCC special licence fees (council-set or the national default bands) and the event permit fee. Confirm the traffic management plan lead time so C can replace the "12 weeks until confirmed" placeholder.
7. **Waimakariri (midnight to 4am).** Repeat steps 2 to 5 for `waimakariri`. Put the key triggers in `lib/rules/waimakariri.ts` as static rules too (same shape as ccc.ts, ids `waimakariri-…`). **Gate:** the demo description with council Waimakariri gives a sensible, *different* requirement list. Add a test for it in `tests/rules.test.ts`.
8. **Source audit (4am to 8am).** Click every source link the app shows (requirements, checklists, deadlines, fees) on the live URL. Every one opens the right page and the quote is on it. Fix or unverify anything that isn't.
9. **Demo seed (with C).** A seeded demo org with the demo event and two licences (club licence, duty manager certificate, fictional names) for the dashboard.

## Gotchas

- `load`, `normalise` and `publish` read `.env.local` (Supabase + OpenAI keys). `crawl` and `extract` need none.
- Pass the council every time: `npm run ingest:crawl -- ccc`. Anything but `ccc` / `waimakariri` is refused.
- Condition paths must be EventProfile paths (list in `scripts/ingest/normalise.ts`). Operators: `eq`, `gt`, `gte`, `truthy`, `all`, `any`. A rule with a path the profile doesn't have never fires.
- Rule ids you publish become `<council>-<id>`. Reuse a static id (e.g. `ccc-host-resp`) to override the static rule.
- If a page needs JavaScript to render and fetch gets an empty shell, save it manually from the browser into `data/raw/<council>/` and add it to the manifest. Only add Playwright if several pages need it.
- `data/` is gitignored on purpose: we store council documents for our own use and link back, never republish them.

## Test in isolation

`npm test` for rules. `select count(*) from kb_chunks;` and `select id, verified, source_quote from rules;` in the Supabase SQL editor. The app with `MOCK=0` shows your rules on the Profile screen with their sources.

## Done when

- [ ] No unverified item in `rules`, `checklists`, `templates`
- [ ] Every rule has `source_url` and an exact `source_quote`; every checklist has `source_url` and `last_checked`
- [ ] Crawl stayed at 1 req/s, seed list + depth 2, one run per council
- [ ] Templates and checklists for every drafted type, both councils
- [ ] The demo event under Waimakariri returns a sensible, different list, with a test

## First prompt to paste into your agent

> You are the data engineer on HostReady (lane B), building a small, accurate, verified council knowledge base. Read AGENTS.md, docs/TRD.md (sections "Knowledge ingestion" and "Data model"), docs/lanes/B-knowledge.md, every file in scripts/ingest/, supabase/migrations/0001_init.sql, lib/rules/engine.ts and lib/rules/ccc.ts. Only edit scripts/ingest/, lib/rules/ccc.ts, lib/rules/waimakariri.ts and tests/rules.test.ts. Start with task 1 from the brief: fetch robots.txt for ccc.govt.nz and waimakariri.govt.nz, summarise anything that restricts our crawl, and propose Waimakariri seed URLs for event permits, alcohol licensing and special licences, fees and charges, and road closures (search by the name Waimakariri, never "WDC"). Show me the list and wait for approval before crawling.
