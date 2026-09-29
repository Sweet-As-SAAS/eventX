# Lane C: backend, integrations and infrastructure

## Mission

Keep `main` deployable every hour, and make every route real without changing its shape. Judges score Execution on "deployment, reliability and whether the MVP actually works", and the live demo runs through your routes: auth, the rules engine, deadlines, the Eventbrite lock, the reminder that lands live, the PDF. D builds against MOCK shapes, A and B build the functions and data your routes call. Your job is to wire them together safely, with no secrets leaking and no org able to see another's events.

## Read first

`AGENTS.md` · `docs/TRD.md` (Architecture, Request path, Changes, Data model, API contract, Integrations, Security) · `docs/SETUP.md` · `lib/api/server.ts` · `app/api/**` · `proxy.ts` · `lib/supabase/*` · `supabase/migrations/0001_init.sql` · `lib/deadlines`, `lib/integrations`, `lib/pdf`.

## You own / do not touch

Own: `app/api/*`, `app/auth/*`, `lib/api/*` (keep `client.ts` in sync with routes), `lib/supabase/*`, `proxy.ts`, `lib/rules/engine.ts`, `lib/rules/index.ts`, `lib/deadlines/*`, `lib/integrations/*`, `lib/pdf/*`, `supabase/migrations/*`, `vercel.json`, `.github/*`, env vars on Vercel.
Do not touch: `lib/schemas.ts` and `lib/ai/prompts.ts` (A), `scripts/ingest/*` and `lib/rules/ccc.ts` (B), `app/(screens)/*` (D).

## Starting state

Already done: every route in the API contract exists, is org-scoped and mock-first (smoke-tested in MOCK: all 16 API routes return the right shapes, PDF export renders); `handler()` turns errors into JSON; `requireOrg()` creates org + membership on first sign-in; `proxy.ts` refreshes sessions and guards screens; login (magic link + guest) and `/auth/callback`; migration with RLS on every table, knowledge tables closed, storage bucket; per-document draft/check/fix; requirements keep existing drafts; deadlines upsert keeps reminder stamps; cron refuses a missing secret and catches up missed days; Eventbrite draft with NZ-safe times and a 409 lock; Resend errors surface; `maxDuration = 60` on AI routes; `syd1` region; CI runs typecheck + tests. `npm run build` passes with zero env vars.

Not done: nothing has run against a real Supabase, OpenAI, Eventbrite or Resend yet. Canterbury holiday dates unverified. Demo org seed. Secrets scan.

## Interfaces

You receive:
| From | What | When |
| --- | --- | --- |
| A | `buildProfile`, `followUps`, `applyAnswers` live | 8pm |
| A | `draftDocument`, `checkDocument`, `applyFix` live; `classify` | midnight / 4am |
| B | Verified `rules`, `templates`, `checklists` rows for CCC | midnight / 4am |

You deliver:
| To | What | When |
| --- | --- | --- |
| Everyone | Repo, CI, Vercel URL with MOCK=1 | +45m |
| A, B | Supabase URL, anon and service role keys (privately), migration run | +45m |
| D | Real routes behind the same shapes (`MOCK=0` on a preview) | events/profile/answers/requirements by 8pm, documents by 2am |
| A | Eventbrite draft link for the pitch; reminder email screenshot as fallback | 4am |

## Tasks (stop at each gate and show the result)

1. **Setup (+45m, gate).** Follow `docs/SETUP.md` parts 2 to 4: GitHub repo + branch rule, Supabase in Sydney, migration, auth settings (email + anonymous, redirect URLs), Vercel with MOCK=1. **Gate:** `https://<app>.vercel.app/api/events/demo/documents` returns the fixture's documents; `/new` → Continue lands on `/events/demo/profile`.
2. **Auth (to 8pm).** Set `MOCK=0` locally with Supabase keys. Guest sign-in on `/login` → `/new` → create an event → row appears in `events` with a new org. **Gate:** a second guest in another browser gets 404 on the first guest's `/api/events/<id>`. Magic link works on localhost and the Vercel URL.
3. **Real routes, first half (to 8pm).** Profile, answers, classify and requirements against A's live functions and the static CCC rules. Deadlines from the stored requirements. **Gate:** the demo event run by hand with curl or the UI gives the fixture's requirements and deadlines.
4. **Deadlines.** Verify `CANTERBURY_HOLIDAYS` against employment.govt.nz (Labour Day, Canterbury Anniversary / Show Day, Christmas, Boxing Day, New Year, Waitangi, Easter, Anzac, King's Birthday, Matariki, all Mondayised). Replace the traffic management plan's unverified 12 weeks with B's sourced figure. `npm test` stays green.
5. **Documents (8pm to 2am).** Draft, check and fix against B's templates and checklists and A's functions. **Gate:** a drafted document shows a real failed checklist item, Fix turns it green, status goes `ready`. All drafts fired in parallel finish inside 60 s on Vercel.
6. **PDF export.** **Gate:** the pack downloads from the live URL with a cover, every drafted document, the sources appendix and the disclaimer. If fonts or layout break on Vercel, try `serverExternalPackages: ["@react-pdf/renderer"]` in `next.config.ts`.
7. **Eventbrite (midnight to 4am).** Private token and org id (`GET /v3/users/me/organizations/`). **Gate:** a draft appears in the Eventbrite dashboard with NZD, the right local start and end times, and the two ticket classes; the route returns 409 while any document is `pending`, `drafted` or `needs_fix`. Save one draft URL as `EVENTBRITE_DEMO_DRAFT_URL`. Never publish.
8. **Reminders.** Resend key, `REMINDER_TO` (your Resend account email unless you verify a domain), `CRON_SECRET` on Vercel. **Gate:** `POST /api/demo/reminder` lands in a real inbox within a minute; `curl -H "Authorization: Bearer $CRON_SECRET" <app>/api/cron/reminders` returns `{ sent, today }`. Screenshot the email as the fallback.
9. **Demo seed (with B).** Seed the demo driver's org with the demo event already profiled and two licences, so the dashboard isn't empty and a rerun is instant.
10. **Harden (4am to 8am).** Secrets scan of the whole history before the repo goes public: `npx gitleaks detect --source . -v` (or `git log -p | grep -iE "sk-|service_role|eyJ"`). Rotate anything found. Check the client bundle has no secrets (search `.next/static` for `service_role` and `sk-`). Deploy freeze at 8am, then watch Vercel logs during the demo.

## Gotchas

- Next 16: `proxy.ts`, not `middleware.ts`. `params` is a Promise. Type route context as `RouteContext<"/api/events/[id]">`. `npm run typecheck` runs `next typegen` first so those global types exist.
- Supabase with the service role bypasses RLS. Every query on an app table must go through `loadEvent` / `loadDocument` or filter by `org_id` yourself. Never read an org id from the body.
- `must(result)` throws on a Supabase error and returns the data. Use `.maybeSingle()` when "not found" is possible, then 404.
- `nzToday()` for today, `nzLocalToUtc()` for local times. Don't use `toISOString().slice(0, 10)` for "today".
- Vercel Hobby runs cron once a day; the route catches up anything missed. The cron sends `Authorization: Bearer $CRON_SECRET` only if `CRON_SECRET` is set on the project.
- Keep MOCK branches returning exactly the real shape. If you add a field, add it to the schema (with A), the fixture and `lib/api/client.ts` in one PR.
- Supabase's built-in email is rate limited. Guest login is the safe path for judges.

## Test in isolation

`npm test`, `npm run typecheck`, `npm run build`. MOCK smoke test: `npm run dev`, then `curl localhost:3000/api/events/demo/documents`. Real: `MOCK=0` in `.env.local`, sign in as guest, walk the flow; watch the terminal for `[demo] serving cached answer` (means a live call failed).

## Done when

- [ ] `npm test`, typecheck and build pass on `main`; CI required on PRs
- [ ] Every route real, same shapes as MOCK; D's screens work with MOCK on and off
- [ ] A second org cannot read the first org's data
- [ ] Eventbrite creates drafts only, locked until all green
- [ ] Reminder lands in an inbox live
- [ ] No secret in client bundles or git history

## First prompt to paste into your agent

> You are the backend engineer on EvntX (lane C) and must keep main deployable at all times. Read AGENTS.md, docs/TRD.md, docs/SETUP.md, docs/lanes/C-backend.md, lib/api/server.ts, lib/api/client.ts, proxy.ts, lib/supabase/*, every route under app/api/, and supabase/migrations/0001_init.sql. Only edit the paths listed under "You own" in the brief. The Next.js here is version 16, so check node_modules/next/dist/docs/ before using any Next API. First, run npm test, npm run typecheck and npm run build and report the results. Then list, route by route, exactly what has to be true in Supabase for that route to work with MOCK=0, and flag anything in the code that looks wrong for Next 16, @supabase/ssr or the migration. Wait for my approval before changing code.
