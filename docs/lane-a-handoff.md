# Lane A handoff

## Working now

- `OPENAI_API_KEY` works locally. Live calls succeeded with `gpt-4o` and `gpt-4o-mini`. On 26 Sep 2026, the API reported 5,000 requests/minute for each model; token limits were 450,000/minute and 2,000,000/minute respectively. These are the key's observed limits, not a promise about future capacity.
- Five profile runs matched all 11 fixture fields marked `stated`; each finished in under 5 seconds. Ten more live profiles, classifications, drafts and checks are saved in `tests/fixtures/ai-live.json` and parsed in CI by `tests/ai-schema.test.ts`.
- The profile corrects an ambiguous year when its month and day match an explicit date, and derives `missing` from null fields so follow-up paths cannot end in `.value`. The raw CCC profile asks three questions that verified rules read.
- Supabase currently has 237 knowledge chunks and five verified CCC templates and checklists. Five CCC drafts completed in parallel in about 11 seconds. The checker flags missing evidence; an accident-register item failed with a placeholder, then passed after the suggested Fix.
- Classification cites a retrieved chunk and does not show a fee amount. Drafting checks citation ids, reconciles placeholder lists with the text, reviews event-specific claims, and rejects unsupported licence status, legal designation and newly invented organisation names when the review cannot repair them.
- `npm test`, `npm run typecheck` and `npm run build` pass on `a/ai-live`.

## Still required before sign-off

1. **Lane B:** Publish verified Waimakariri rules, templates and checklists, then confirm the council switch produces a different requirement list. The Waimakariri static rules are still empty. Confirm the source used for the community/commercial distinction is appropriate for classification; a fee table alone does not settle every event.
2. **Lane C:** Test the real authenticated routes on a Preview with `MOCK=0`, including draft/check/fix and the seeded-event fallback with the network unavailable. The isolated fallback tests pass, but the complete browser route has not yet been exercised. Add `OPENAI_API_KEY` to the Lane A Preview branch if it will host that test; the current Vercel screenshot shows only Production and two other branch-specific Previews.
3. **Demo fixture:** Its description now explicitly says alcohol is sold. Any already seeded event using the older description must be reseeded for `isSeeded()` to recognise it. The current fixture is still a placeholder: it marks some documents `ready` even though they contain unknown organiser details. Choose the final stage scenario and supply those details before replacing the cached drafts and checks with a truthful, one-red-item live run.
4. **Production handoff:** Production still appeared to have `MOCK=1` when its demo-documents API returned 200 without sign-in. Once Lane C's real flow works, set Production `MOCK=0`, redeploy, and verify a live profile request. Keep `DEMO_MODE=1` for the seeded fallback.
5. **Pitch:** A sourced five-minute script and submission copy are in `docs/pitch-prep.md`. There are no verified customer-call quotes. The supplied Reddit post concerns ticket checkout rather than permits, so it does not validate this product. The current fixture is the working stage scenario, with site-plan work and minor tweaks still possible. Rehearse twice with the demo driver and submit before 10:00 NZDT Sunday. The deploy freeze is 08:00 NZDT; daylight saving starts at 02:00.

## Reproduce the evidence

```bash
npx tsx --env-file=.env.local scripts/try-profile.ts 5
npx tsx --env-file=.env.local scripts/try-ai.ts
npx tsx --env-file=.env.local scripts/try-check.ts
npx tsx --env-file=.env.local scripts/record-ai.ts
npm test
npm run typecheck
npm run build
```

The scripts read `.env.local`; never commit that file or paste its values into a PR.
