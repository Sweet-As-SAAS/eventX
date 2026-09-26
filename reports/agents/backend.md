# Backend sub-agent handoff

## Summary
Waimakariri is gone from every backend file, and new migration `0003_ccc_only.sql` makes ccc the only council. POST /api/events now defaults to ccc.
The reminder cron emails only `REMINDER_TO`. Event and document `[id]` params are now checked with Zod (a non-uuid id gives 404, not a Postgres 500).
Every MOCK route was smoke-tested against `lib/schemas.ts` on a dev server and all parse. The PDF, Eventbrite and RLS checks passed as they were.

## Files changed
- `lib/rules/waimakariri.ts`: deleted.
- `lib/rules/index.ts`: dropped the Waimakariri import; `staticRules` is now the CCC set.
- `lib/deadlines/index.ts`: removed the Waimakariri liquor source URL and its branch. The special licence always cites the CCC form. Kept the `council` param (typed `CouncilSlug`, default `"ccc"`) because tests pass it by position. Sun 14 Mar 2027 still gives legal minimum 2027-02-15 and recommended 2027-01-29 (checked).
- `app/api/events/route.ts`: `council: CouncilSlug.default("ccc")`. Any other value is a 400.
- `lib/api/client.ts`: `createEvent` takes `council?` (optional).
- `lib/api/server.ts`: `loadEvent` / `loadDocument` check the id with `z.guid()` and return 404 if it fails. Every real-mode `[id]` route goes through these two functions, so the check lives in one place.
- `app/api/cron/reminders/route.ts`: sends only to `process.env.REMINDER_TO`. If it is unset, the cron returns `{ sent: 0, today }` without sending or stamping, so reminders still go out once it is set. I removed the lookup of org members' emails. The CRON_SECRET check, the 14- and 3-day windows and the `reminded_*` stamps are unchanged.
- `scripts/ingest/seeds.ts`: removed the Waimakariri seeds. `councilArg` accepts only `ccc`.
- `scripts/e2e-flow.mts`: removed the council CLI argument; `createEvent({ description })`.
- `supabase/migrations/0003_ccc_only.sql` (new, not run anywhere):
  - makes sure the ccc row exists
  - moves events and organisations from any non-ccc council to ccc (keeps user data)
  - clears `rules.source_id` wherever it points at a non-ccc source
  - deletes non-ccc rules, checklists, templates, form_fields and kb_sources (kb_chunks go with them by cascade), then the non-ccc councils
  - replaces `councils_slug_check` with `check (slug = 'ccc')`
  - every DML statement has a WHERE clause, every non-ccc match uses `slug <> 'ccc'`, and the file can be run twice safely
- `crawl.ts`, `demo-fixture.ts`: no change needed (crawl reads `SEEDS[council]`).

## Audited, no change needed
- **Zod on inputs:** every body route validates its body (events, answers, edit, fix, eventbrite). Routes with no body take no input.
- **Response shapes:** under MOCK=1, all 16 route calls parse against the schemas, including the draft→check→fix→eventbrite unlock. Bad bodies give 400. Eventbrite gives 409 before the fix. Cron without auth gives 401. Export returns application/pdf.
- **`maxDuration = 60`:** set on profile, classify, draft, check, fix, eventbrite and export. answers and edit have no AI calls.
- **Eventbrite:** only POSTs `/organizations/:org/events/` and `/events/:id/ticket_classes/`. It never calls publish. Uses NZD, `Pacific/Auckland`, UTC from `nzLocalToUtc`, and one ticket class per ticket. The "ready or manual" 409 lock is unchanged.
- **PDF:** cover page, every drafted document, and a sources appendix (url plus "Source checked"). The disclaimer is a `fixed` footer on every Page, so it repeats on wrapped pages too.
- **RLS:** 0001 enables RLS on all 14 tables. App tables have per-org policies (the requirements, documents and deadlines policies go through the events RLS). Knowledge tables have no policies. The `kb` bucket is private. Nothing to add.
- **Org scoping:** every app-table read or write happens after `requireOrg` + `loadEvent`/`loadDocument`, keyed by that event's id. The cron is cross-org by design (a system job).

## Tests
- `npm test`: 82 passed, 1 failed. The failure is `tests/deadlines.test.ts` "does not show CCC permit timing ... for Waimakariri", which expects a waimakariri.govt.nz URL. It is expected (the tests agent owns it); I did not edit tests.
- `npm run typecheck`: clean for every file I own. The remaining errors are in `components/council.ts`, `components/format.ts`, `tests/ai-profile.test.ts`, `tests/deadlines.test.ts` and `tests/rules.test.ts`, all Waimakariri references owned by the frontend and tests agents.
- `npx eslint` on every file I own: clean.
- `npm run build`: it compiles, then fails at the TypeScript step on the same errors from other lanes. It should pass once those lanes land.

## Decisions made without a human
- The migration moves non-ccc events to ccc instead of deleting them. That keeps organisers' data. Waimakariri had no rules, so those events had no requirements that could go stale.
- The cron with no `REMINDER_TO` counts 0 and stamps nothing, so no reminder is silently lost.
- In MOCK, event ids are not checked (every event route serves the fixture whatever the id). Document ids are already checked against the fixture by `mockDocument`.

## Requests for other agents
- **Frontend:** stop sending `council` from `components/describe-form.tsx` (it is optional now), and remove Waimakariri from `components/council.ts` and `components/format.ts`.
- **Tests:** update the Waimakariri tests listed above. The special licence `sourceUrl` is now always `https://ccc.tfaforms.net/177`.
- **Docs (orchestrator):** in the TRD, change the POST /api/events body to `{ description, council? }`.

## Left undone
- Storage objects in the `kb` bucket for deleted non-ccc sources stay behind as orphans. They are harmless; delete them by hand if they ever matter.
