# Timing (Phase 4)

No live OpenAI calls were made in this audit, because the safety rules say tests never call the real API. Real-mode numbers below come from Lane A's earlier live runs, which are recorded in `docs/lane-a-handoff.md`. Parallelism and timeouts were checked with mocked delays.

## MOCK=1 E2E (production build, `npm run e2e`, 26 Sep 2026)

| Project | Golden path test | Budget | Result |
| --- | --- | --- | --- |
| desktop 1280×800 | 9.7 s | < 30 s | pass |
| mobile 390×844 | 7.2 s | < 30 s | pass |
| Whole command incl. `next build` + `next start` | 53.9 s | n/a | build is most of it |

Against a warm `next dev`, the tests agent measured 11.0 s on desktop and 12.6 s on mobile.

## Real-mode budget

| Step | Budget | Evidence | Status |
| --- | --- | --- | --- |
| Profile | < 10 s | Lane A: 5 live runs, each under 5 s (`docs/lane-a-handoff.md`) | met (earlier live run, not re-measured) |
| All drafts in parallel | < 60 s | Lane A: 5 CCC drafts in parallel in about 11 s. `tests/ai-mocked.test.ts`: 6 drafts at 200 ms per model call finish in under 800 ms (serial would be 2,400 ms) | met (earlier live run, plus mocked proof of parallelism) |
| DEMO_MODE fallback | ≤ 20 s | `tests/ai-demo.test.ts` fake timers: the seeded event gets the cached answer at exactly 20,000 ms, and a non-seeded event keeps waiting for the live call | verified (mocked) |
| Whole flow incl. taps | < 2 min | MOCK run: 7–10 s of machine time. Live AI waits add about 5 s (profile) + about 11 s (drafts) + the check and fix calls | expected to be met; not measured live end to end |

## Timing logs added

`lib/ai/client.ts` now logs one line per AI call: `[ai] <name> <model> <ms>ms`, or `[ai] embed <model> <ms>ms` for embeddings. The line is written in `finally`, so failed calls are timed too. Prompt content and env values are never logged. To measure a live run, set `MOCK=0`, walk the flow, and read these lines in the server log.
