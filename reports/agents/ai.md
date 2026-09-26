# ai sub-agent handoff

## Summary
- Model names now come only from env (`OPENAI_MODEL_FAST`, `OPENAI_MODEL_STRONG`, new `OPENAI_MODEL_EMBED`), read at call time; a live call without one throws `"<VAR> is not set ..."`.
- Model per step matches TRD: fast for profile, check and fix; strong for classification and drafting (and ingest normalise).
- Every AI call logs one timing line `[ai] <name> <model> <ms>ms` (embed: `[ai] embed <model> <ms>ms`); no prompt content logged. The last inline prompt (ingest normalise) moved to `lib/ai/prompts.ts`.

## Files changed
- `lib/ai/client.ts`: removed `MODEL_FAST`/`MODEL_STRONG` constants and the hardcoded `gpt-4o-mini`/`gpt-4o`/`text-embedding-3-small`. Added `modelFor(tier)` (throws naming the missing var). `structured()` now requires `model: "fast" | "strong"`. Timing logs in `structured()` and `embed()` (in `finally`, so failures are timed too). Reasoning-model temperature skip kept.
- `lib/ai/check.ts`: `checkDocument` strong -> fast (TRD step 6); `applyFix` already fast, now `"fast"`.
- `lib/ai/profile.ts`: `buildProfile` strong -> fast (TRD step 1 says fast).
- `lib/ai/classify.ts`, `lib/ai/draft.ts`: use `"strong"`.
- `lib/ai/prompts.ts`: added `normaliseSystem(council, profilePaths)` (moved from normalise.ts, text unchanged).
- `scripts/ingest/normalise.ts`: uses `normaliseSystem` and `model: "strong"`.
- `scripts/record-ai.ts`: records the embed model name alongside fast/strong.
- `.env.example`: added `OPENAI_MODEL_EMBED=` (empty) with a comment that it must output 1536 dims to match `kb_chunks.embedding`. Existing FAST/STRONG values left as they were ("do not change which models the env points to").

## Verified, no change needed
- `withDemoFallback`: default timeout 20 000 ms, timer cleared in `finally`, only active with `DEMO_MODE=1` and a non-null cached value. `isSeeded` compares council slug and trimmed description against the fixture; council is always `ccc` so it holds.
- Drafts: `draftDocument` is one self-contained call chain per document (draft + up to 2 review passes, sequential only within that one document). No module-level locks, queues or shared mutable state in `lib/ai`, so the UI's parallel requests run in parallel.
- `fence()` wraps all retrieved/scraped text (classify, draft, draft review, normalise). Temperature 0 via `structured()`. Draft/check placeholder and proper-name guards untouched.
- `fixtures/demo-event.json`: zero Waimakariri/WDC hits; special licence deadline legalMinimum 2027-02-15, recommended 2027-01-29. Not modified.
- Zero "waimakariri"/"WDC" hits in all owned files.

## Tests
- `tests/ai-*.test.ts` + `tests/contract.test.ts`: 6 files, 30 tests pass.
- `npm run typecheck`: no errors in owned files. Remaining errors are other lanes' Waimakariri leftovers: `components/council.ts`, `components/format.ts`, `tests/ai-profile.test.ts`, `tests/deadlines.test.ts`, `tests/rules.test.ts`.
- `eslint` on owned files: clean.

## Decisions made without a human
- `buildProfile` switched strong -> fast: TRD pipeline table and the brief both say fast for profile.
- Ingest normalise stays on strong (extraction/classification-like, quality over speed, offline script).
- API shape: tier strings (`"fast" | "strong"`) rather than exported model constants, so no call site can hold a stale or hardcoded name.
- `OPENAI_MODEL_EMBED` left empty in `.env.example` per instruction; it must be set before `retrieve()` or `npm run ingest:load` run live.

## Requests for other agents
- **tests agent** (mocked-OpenAI tests): `MODEL_FAST`/`MODEL_STRONG` no longer exist. `structured()` needs `model: "fast" | "strong"`; `modelFor("fast"|"strong"|"embed")` is exported. Set `process.env.OPENAI_MODEL_FAST/STRONG/EMBED` to any dummy string in the test (or `vi.stubEnv`), otherwise the call throws `OPENAI_MODEL_... is not set` before reaching the mocked client. Expected routing to assert: `event_profile` and `check_result` and the fix `draft_document` -> FAST; `classification`, `draft_document` (draft) and `reviewed_draft_document` -> STRONG. `console.info` now fires once per call (spy on it if you want quiet output or to assert the `[ai] <name> <model> <n>ms` format).
- **orchestrator / deploy**: add `OPENAI_MODEL_EMBED` to `.env.local` and Vercel (the 1536-dim model the KB was embedded with). Without it, live retrieval throws.

## Left undone
- Nothing in scope.
