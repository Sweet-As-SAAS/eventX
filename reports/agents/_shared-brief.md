# Shared brief for every audit sub-agent

You are one sub-agent in an unattended audit of the HostReady repo. No human is available: never ask questions, decide using `docs/PRD.md` and `docs/TRD.md`, log the decision in your handoff note, and continue. Where this brief and the docs disagree, this brief wins.

Read first: `AGENTS.md` (hard rules, Next 16 gotchas), `docs/PRD.md`, `docs/TRD.md`, `lib/schemas.ts` (the contract), `fixtures/demo-event.json` (the golden demo event, "Sarah's event": Riccarton RFC fundraiser at Hagley Park, Sun 14 Mar 2027), `reports/coverage.md`, and your lane brief in `docs/lanes/`.

## Decisions already made (override anything older in code or docs)

- Golden path: Describe → Profile (max 3 tap questions) → Classification → Documents with council checklist and one-click fix → Site plan → Deadlines, reminders, PDF export → Eventbrite draft → Dashboard.
- Christchurch City Council (`ccc`) is the ONLY council. Remove Waimakariri everywhere it appears in your files (council pickers, rules, seeds, tests, fixtures, copy). `lib/schemas.ts` already has `CouncilSlug = z.enum(["ccc"])`. No council selector in the UI; every event is ccc. The words "waimakariri" and "WDC" must end with zero hits in your files.
- Eventbrite creates a DRAFT only, never publishes, and returns 409 until every document is ready (the orchestrator keeps the TRD's "ready or manual" rule, because manual documents such as the site plan and the permit form can never become "ready"; do not change that).
- The app never scrapes at runtime. AI reads only from our Supabase knowledge base.
- Rules engine and deadline maths are deterministic TypeScript. No AI in `lib/rules` or `lib/deadlines`.
- Only verified rules, checklists and fees reach the UI. Every one shows its source link and last-checked date. Unknown fees show "varies, check with council".
- Special licence for Sun 14 Mar 2027: recommended Fri 29 Jan 2027 (Mondayised Waitangi Day), legal minimum Mon 15 Feb 2027. The UI shows what the engine returns, never hardcoded dates.
- `MOCK=1` makes every route return the fixture. `DEMO_MODE=1` falls back to the fixture after 20 s or on error (seeded event only).
- Out of scope, remove if present: our own ticketing, promo content generation, sales stats, real council lodgement, payments, any council other than CCC.
- Every screen states: "HostReady prepares documents. You review them and lodge them with the council. This is not legal advice." (root layout and PDF already carry it).
- UX: Stripe Atlas style guided flow (stepper, one main action per screen, calm whitespace, status badges) and TurboTax style intake (plain-language questions, tap answers, inferred values editable, reassurance after each step). Borrow patterns only, never their visuals or copy.

## Models

OpenAI model names live only in env vars (`OPENAI_MODEL_FAST`, `OPENAI_MODEL_STRONG`). No hardcoded model names anywhere else. Fast model: profile, follow-ups, checking. Strong model: drafting and classification. Do not change which models the env points to.

## Safety limits

- Work only in your own git worktree. Commit your work there when done (one or more commits, clear messages, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Never push, never force anything, never touch `main`.
- Never commit secrets. Never print env values. There is no `.env.local` in your worktree; do not create one with real values.
- Never run SQL against any remote database. Schema changes go in a new file in `supabase/migrations/`; never edit `0001_init.sql`.
- Never publish an Eventbrite event. Never call the real Eventbrite, Resend or OpenAI APIs from tests or scripts. Never send email to any address except `REMINDER_TO`.
- Nobody but the orchestrator changes `lib/schemas.ts`. Need a change? Put it in your handoff note.
- Edit only the files you own. Need something outside them? Write the request in your handoff note.
- Max 3 fix attempts per failing issue. Still failing: add a skipped test with a `TODO(audit)` comment, log it, move on.
- No new dependencies unless the spec needs them. Log any you add.
- Do not touch `components/site-plan.tsx` or `app/(screens)/events/[id]/site-plan/page.tsx`: a teammate owns the site plan.
- Code style: match the surrounding code (short, commented where it earns it, `lib/` uses relative imports, `app/` may use `@/`). Smallest diff that meets the spec.

## Setup in your worktree

Run `npm ci` first (the worktree has no `node_modules`). Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Other lanes are fixing their own files in parallel, so typecheck or lint errors in files you do not own are expected: report them, do not fix them.

## Handoff note (save to `reports/agents/<your-name>.md` and commit it)

- Summary in 3 lines
- Files changed, with one line each on what and why
- Tests added or fixed, and their result
- Decisions made without a human and why
- Requests for other agents
- Anything left undone and the next step

Your final message to the orchestrator: the worktree path, branch name, commit hashes, and the handoff note text.
