# Tests lane handoff

## Summary
- Vitest now has a config with the `@` alias, so route handlers can be imported. It covers every MOCK route against `lib/schemas.ts`, mocked OpenAI (profile, model routing, parallel drafting, the 20 s demo fallback), CCC-only rules, and the deadline and NZ-time edge cases. 112 tests, all green.
- A Playwright golden path walks Sarah's event (Describe → Details → Questions → Documents fix → Site plan → Deadlines → Home) on desktop (1280×800) and mobile (390×844). It passes against a production build under MOCK=1 + DEMO_MODE=1 and saves 18 screenshots to `reports/screenshots/`.
- There are no Waimakariri or WDC references left in tests, e2e or the configs. `npm test`, `npm run typecheck` and `npm run lint` are clean on the merged tree (audit/full-check with ai, backend and frontend merged in).

## Files changed
- `vitest.config.ts` (new): includes only `tests/**/*.test.ts`, excludes `e2e/**`, `.claude/**` and `node_modules/**`, and maps `@` to the repo root.
- `tests/council.test.ts`: deleted, because `components/council.ts` is gone.
- `tests/rules.test.ts`: the Waimakariri case is replaced with checks that every event resolves to ccc (`CouncilSlug.options` is `["ccc"]`, other slugs are rejected, every static rule is ccc, and every verified rule has an https source). Added a test that one rule fires when verified and never fires when unverified.
- `tests/deadlines.test.ts`: the Waimakariri case is removed. Added:
  - Sarah's special licence: legal minimum 15 Feb 2027, recommended 29 Jan 2027, via Mondayised Waitangi Day on 8 Feb.
  - The liquor period 20 Dec to 15 Jan is skipped only when counting liquor working days.
  - Weekends, Show Day and Good Friday are not working days.
  - `nzToday` rolls over at NZ midnight in NZST, in NZDT, and on the 23-hour day of 27 Sep 2026.
- `tests/eventbrite.test.ts`: added the evening before daylight saving starts, the day it ends (4 Apr 2027), and the fixture event's NZDT start and end.
- `tests/ai-profile.test.ts` and `tests/ai-demo.test.ts`: Waimakariri replaced. Added a fake-timer test: the seeded event gets the cached answer at exactly 20 000 ms, while a non-seeded event keeps waiting for the live call.
- `tests/ai-mocked.test.ts` (new): mocks `structured()` and `retrieve()`; `openai()` and `embed()` throw if anything calls them. Covers:
  - `buildProfile`: forces ccc, fixes a past year, recomputes missing paths, and handles all 10 recorded live profiles.
  - Profile failures come through as errors, with no invented profile.
  - Parallel drafting: 6 `draftDocument` calls at 200 ms per model call finish in about the time of one draft (under 800 ms; serial would take 2400 ms).
  - Model routing: `event_profile`, `check_result` and the fix's `draft_document` go to fast; `classification`, `draft_document` and `reviewed_draft_document` go to strong.
- `tests/ai-client.test.ts` (new): with the openai SDK mocked, `modelFor` reads env at call time and throws when unset. `structured` sends the tier's env model and logs one `[ai] <name> <model> <ms>ms` line.
- `tests/routes.test.ts` (new): runs every route under MOCK=1 with `next/headers` mocked and `fetch` stubbed. `data:` URLs are allowed through for react-pdf's wasm; any network call fails the test. What it checks:
  - Every response parses against its schema: EventSummary[], {id}, EventDetail, ProfileResponse (GET and POST profile, answers, edit), Classification, Requirement[], EventDocument[], EventDocument (draft, check, fix, which also sets the cookie), Deadline[] (29 Jan and 15 Feb), Licence[], {ok:true}, and EventbriteDraft.
  - The export returns `application/pdf` and starts with `%PDF-`.
  - Invalid bodies return 400: events (including a non-ccc council; council itself is optional), answers, edit, fix, and eventbrite tickets.
  - Cron returns 401 when the secret is unset and when the bearer is wrong.
  - Eventbrite returns 409 before the fix, 200 with `{id,url}` after it, and 409 for a non-demo event.
- `playwright.config.ts` (new):
  - `webServer`: `npm run build && npx next start -p 3137` with env `MOCK=1`, `DEMO_MODE=1`. `E2E_DEV=1` switches to `next dev` and `E2E_PORT` overrides the port.
  - Projects `desktop` and `mobile`, chromium only.
  - Output goes to `test-results/` and `playwright-report/` (html, never auto-opens). Both are already in `.gitignore` and the ESLint ignores.
- `e2e/golden-path.spec.ts` (new): uses role + text selectors. A step that fails is recorded and the walk carries on (it jumps to the screen's URL if a click didn't navigate). The test ends with one assertion that lists every failed step.
- `package.json` / `package-lock.json`: added the `@playwright/test` devDependency and the `"e2e": "playwright test"` script.
- `reports/screenshots/*.png`: 01-describe through 09-home, for each project.

## Results
- `npm test`: 14 files, 112 tests pass, about 4 s.
- `npm run typecheck`: pass. `npm run lint`: pass.
- `npm run e2e` against the production build: 2 passed. desktop 7.7 s, mobile 7.1 s, 52.9 s wall time including `next build`. Against a warm `next dev`: desktop 11.0 s, mobile 12.6 s. Both are under the 30 s per project target.
- No selector failed on the merged frontend.

## Decisions made without a human
- The E2E port is 3137, not 3100, because 3100 was already in use on this machine (probably another lane's server). It can be overridden with `E2E_PORT`.
- The spec reads the event id `demo` and the description, name and questions from the fixture. It does not hardcode deadline dates beyond the "29 Jan" / "15 Feb 2027" text the brief asked for.
- `computeDeadlines` kept its `council` param after the backend merge, so the traffic test calls it as `(date, reqs, "ccc", impact)`.

## Requests for other agents
- backend: `computeDeadlines` gives the event permit a recommended date of Sun 3 Jan 2027 (`eventDate - 70` calendar days), which falls on a weekend and inside the Christmas closure. Worth considering whether to roll it back to the previous working day. I don't own the file, so no test asserts this.
- orchestrator: no `.gitignore` changes are needed. On Windows, a `next dev` left running (for example after an aborted Playwright run) locks `node_modules/lightningcss-*` and breaks `npm ci` with EPERM. Kill the node processes for that worktree before reinstalling.

## Left undone
- Nothing from the brief. The E2E never runs against live keys by design.
