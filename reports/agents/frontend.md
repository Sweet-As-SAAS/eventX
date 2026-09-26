# Frontend agent handoff

## Summary
Council picker and every Waimakariri reference are gone from the UI. Describe is now one textarea with a 2,000 character counter, and every event screen has a Stripe Atlas style stepper that works at 390px.
Every AI wait now shows progress. Sources and last-checked dates are on every requirement and every checklist, and classification reads "likely" with its reasoning and "Council fee: varies, check with council". Eventbrite is locked with a reason, shows a 409 inline, and says "draft, not published".
Lint is clean for all my files. Typecheck and build compile my code; the only failures are in `tests/*`, which belong to the tests agent.

## Files changed
- `components/council.ts`: deleted. With one council, working out the council from the place does nothing.
- `components/describe-form.tsx`: no picker and no "Where" field. One textarea (or the pill input) with an "n of 2,000 characters" counter. Calls `api.createEvent({ council: "ccc", description })`. Uses `useId` so the two forms on the landing page don't clash. Lint fixes: speech support is read with `useSyncExternalStore`, and the prefill uses a `key` reset instead of an effect.
- `app/(screens)/new/page.tsx`: "Run it again" and "start from a past event" remount the form with `key`. The intro copy mentions Christchurch.
- `components/format.ts`: Waimakariri removed from `COUNCIL_LABEL` and `sourceName`.
- `components/event-steps.tsx`: new stepper (Details → Documents → Site plan → Deadlines). It shows a progress rail, a numbered or check-marked circle (desktop), bold current step with `aria-current="step"`, and "(done)" for screen readers. It also shows the reassurance line for the step just finished. The Share button is now 44px and the breadcrumb link has a 44px target.
- `app/(screens)/events/[id]/profile/page.tsx`: new `ClassificationNote`. It shows "Likely a community/commercial event" or "Community or commercial: not clear yet", the reasoning, and "When you apply: howToPresent". It always says "Council fee: varies, check with council", because the API has no verified fee field. It shows a spinner while classifying and a message if classification fails. Also shows "Working out which documents the council needs…" while leaving, and 44px targets.
- `app/(screens)/events/[id]/questions/page.tsx`: shows progress while working out documents, "Each answer saves as you tap" as reassurance, and no all-caps label.
- `app/(screens)/events/[id]/documents/page.tsx`: every requirement row now has a `SourceLine` (link and checked date). The checklist `SourceLine` is always shown and reads "not confirmed yet" if the source is missing. Other changes:
  - A spinner in the Drafting/Checking pill.
  - Row buttons now read Open/Close instead of "Continue".
  - A status line under the main action.
  - "Continue to site plan" drops to secondary while a fix is outstanding, so there is one main action.
  - Rows no longer squash on phones.
- `app/(screens)/events/[id]/deadlines/page.tsx`:
  - Eventbrite button is disabled with `aria-describedby` pointing at its reason. A 409 shows the API message inline. After success the page says "It is a draft, not published", with an "Open your Eventbrite draft" link.
  - Progress text for creating the draft and sending the reminder.
  - A `/deadlines` failure shows its message and a link to Details, instead of a skeleton that never resolves.
  - Deadline sources now show the matching requirement's checked date.
  - Timeline labels no longer cause horizontal scroll at 390px.
- `app/(screens)/budget/page.tsx`: localStorage is read through `useSyncExternalStore`, with an in-memory fallback (lint fix, no hydration mismatch). Council lines still say "Fee varies, check with council", and amounts are only what the organiser types. Delete button is 44px with better contrast.
- `components/sidebar.tsx`: lint fixes. Collapse state is read from an external store, the mobile menu closes on navigation (state derived from the path), and current-event data is derived instead of reset in an effect. Nav rows are 44px.
- `components/ui.tsx`: `SourceLine` links get a 44px hit area through a pseudo-element. Disabled text contrast raised.
- `components/home.tsx`, `app/page.tsx`, `app/login/page.tsx`: 44px chips and buttons, placeholder contrast raised (neutral-400 was about 3:1, neutral-500 is about 4.9:1), and "work out the council from the place" copy removed.

## Main action per screen (exact accessible names, for the E2E)
- Describe `/new`: textbox labelled **"Your event, in your words"**, button **"Check my event"** (disabled under 10 characters). The pill on `/dashboard` and `/` uses textbox "Describe your event" and button "Check my event".
- Details `/events/:id/profile`: button **"Looks right"**. While the AI reads the event, the status text is "Reading your event…".
- Questions `/events/:id/questions`: answers are buttons named by option text inside `role="group"`. Main action: button **"Continue to documents"**.
- Documents: link **"Continue to site plan"**. Per document: button **"Fix it"** on a needs-fix row, or "Open"/"Close". Inside a failed item: "Apply fix" or "Add to draft".
- Site plan (teammate's page): link **"Continue to deadlines"**.
- Deadlines: link **"Download PDF pack"**, button **"Send me the reminder now"**, button **"Create Eventbrite draft"**. After success: link **"Open your Eventbrite draft"**.
- Stepper: links "Details", "Documents", "Site plan", "Deadlines" inside `nav` named "Step n of 4".

## Tests and checks
- `npm run lint`: 0 problems.
- `npm run typecheck` and `npm run build`: my files compile. Build compiles, then fails type-check only in `tests/ai-profile.test.ts`, `tests/council.test.ts`, `tests/deadlines.test.ts` and `tests/rules.test.ts` (Waimakariri references and the deleted `components/council`). These belong to the tests agent.
- Golden path walked with `MOCK=1 next dev -p 3291` using a headless Playwright script at 390x844 and 1280x900: Describe → Profile → Questions → Documents → Fix → Site plan → Deadlines → Eventbrite draft → Dashboard, plus Budget, Licences, landing and login. Results:
  - No horizontal scroll anywhere.
  - The disclaimer is visible on every screen.
  - No page errors.
  - Every control is at least 44px. The exceptions are inline source text links, which have a 44px hit area through the pseudo-element.
- Dev server stopped when done. No tests added; the tests agent owns E2E.

## Decisions made without a human
- Removed the separate "Where is it?" field. It only existed to detect the council, and the description prompt already asks where.
- Fee: the contract has no fee field, so the UI always says "Council fee: varies, check with council" and never shows a number.
- "Completed" steps in the stepper mean "before the current step" (linear flow). The site plan isn't saved anywhere, so there is no real completion state to read.
- Kept the 20 Dec to 15 Jan shading on the timeline. It is a fixed statutory period shown for context (the lane brief asks for it), not a computed deadline. Its inline label was dropped because it collided on phones; the legend names it. "In N days" labels remain display-only arithmetic on dates from `/deadlines`.
- Kept the landing page's illustrative example. It reads verified rules from `lib/rules/ccc` and is not promo generation. Kept Budget: it has no ticketing, payments or sales stats.
- On the Documents screen, "Fix it" stays primary on red rows, and the Continue link drops to secondary while a fix is outstanding.

## Requests for other agents
- tests: delete `tests/council.test.ts` and remove `"waimakariri"` from `tests/ai-profile.test.ts`, `tests/deadlines.test.ts` and `tests/rules.test.ts`. Build is blocked on these alone.
- backend/orchestrator (optional): if `EventDetail` exposed the Eventbrite draft URL, the Deadlines page could show the existing draft link after a reload. Right now only `eventbriteEventId` comes back, so the link appears only right after creating the draft.
- orchestrator (optional): `Deadline` has no `lastChecked`. The UI borrows it from the matching `Requirement`. Adding it to the schema would make this exact.

## Left undone
- Couldn't trigger the 409 path in MOCK, because the fixture's documents are all ready or manual after the fix. The code path shows `ApiError.message` inline when the status is 409.
- Dark-mode contrast was not audited; the app ships light only.
