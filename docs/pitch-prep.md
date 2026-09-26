# HostReady pitch preparation

Working draft for the five-minute Saasthon presentation. Replace the bracketed stage details only after the final demo event and driver are confirmed. The fixture is a placeholder, not a customer story.

## Submission copy

**Title:** HostReady — event permits without the paperwork maze

**Description:** HostReady turns an organiser's event description into a council-specific checklist, document drafts, a working-day timeline and a reviewable PDF pack. It cites verified council sources, checks drafts against the council's own list, and keeps Eventbrite drafting locked until the required checks pass. Organisers review and lodge the documents themselves. The weekend build starts with Christchurch City Council and a Waimakariri comparison.

**Repository:** https://github.com/Sweet-As-SAAS/hostready

Before submission, confirm the repo is public or the required judge account has access. Do not say the Waimakariri comparison works until Lane B has published its verified rules and the switch has been checked.

## Five-minute run of show

| Time | Screen / action | Speaker line |
| --- | --- | --- |
| 0:00–0:35 | Problem slide | “An event organiser can plan the fun part in one paragraph. The permit and safety paperwork is a different job. In Ashburton, a community parade organiser faced a $2,050 permit charge for the associated market after the council classified it as commercial. Road closure was another roughly $3,500.” [1] “In Featherston in 2023, an Anzac service stayed stationary because the council said it could not afford the state-highway traffic management.” [2] |
| 0:35–0:55 | Demo scenario card | “Here is [the confirmed demo organiser] planning [the confirmed event]. They need to know what to prepare, why it is required, and when it is due.” Do not present fixture details as a real customer. |
| 0:55–2:35 | Type description; profile; requirements; drafts; red item → Fix | “They describe the event once. HostReady extracts the facts, asks only for missing details the verified rules need, and shows the council source behind each requirement. Its first draft has a gap; the checklist catches it. We fill the missing fact, run Fix, and the item turns green.” If the checklist cannot be fixed live, show the genuine red state and explain the missing organiser input. |
| 2:35–3:25 | Timeline, PDF, reminder, Eventbrite | “The same event gets a working-day timeline and a pack for the organiser to review and lodge. A reminder email lands, and the Eventbrite draft unlocks when all required checks are green.” Show each outcome only after it has worked in the real Preview. |
| 3:25–3:50 | Council switch | “Switching to Waimakariri changes the requirement list because council rules and templates are data.” Show only after the second council's verified data is live. |
| 3:50–4:25 | Why HostReady | “A general chatbot can draft prose. HostReady keeps the cited council rule, deterministic requirements and dates, checklist evidence, reminders and the publishing gate together. It marks unknown details for the organiser instead of inventing them.” |
| 4:25–5:00 | Business and close | “We are testing a $29 per-event price with clubs and venues; willingness to pay has not yet been validated. Next are more councils and official form filling. Our aim is to get organisers from an event idea to a reviewable submission pack before they lose a weekend to paperwork.” |

The stage driver should navigate. The speaker should advance only when the screen visibly confirms the claimed outcome. If a live call fails, use the seeded demo response only after the complete `DEMO_MODE` route has been tested with the network unavailable, and disclose that the response is cached.

## Evidence for the problem slide

1. [1News / Local Democracy Reporting, 16 July 2026](https://www.1news.co.nz/2026/07/16/people-power-rallies-to-save-ashburton-santa-parade/): the 2025 market was classified as commercial and charged a $2,050 event permit; the parade fee was waived; the organiser described road closure as around $3,500. These figures belong to that case, not a universal council fee.
2. [Wairarapa Times-Age, 22 April 2023](https://times-age.co.nz/districts/featherston-news/no-road-closure-for-featherstons-anzac-day-service/): Featherston's 2023 service was stationary after the council said it could not afford SH2 traffic management. A separate [South Wairarapa District Council report, 13 March 2024](https://swdc.govt.nz/wp-content/uploads/D1-Extraordinary-business-Member-Report-Funding-of-TMP-for-ANZAC-Day-13Mar24.pdf) estimates $7,186 plus GST for the 2024 Anzac traffic-management plan. Do not conflate the 2023 decision with the 2024 estimate.

## Validation and claims

- The team has no verified Saturday customer-call quotes. The supplied [Reddit post](https://www.reddit.com/r/smallbusinessowner/comments/1w3bxw0/looking_for_event_registration_software/) discusses attendee checkout drop-off, ticket types and Eventify; it does not discuss council permits or document preparation. It is not evidence of demand for HostReady and should not appear on a customer-validation slide.
- The $29 per-event price is a proposed test from the PRD, not observed willingness to pay. Avoid revenue, market-size or time-saved figures without measured evidence.
- The AI pipeline has live local evidence: five profile runs matched all stated fixture fields, five CCC drafts completed in about 11 seconds, and an actual red checklist item passed after Fix. This is engineering validation, not customer validation or proof of the entire production route.
- The user must review and lodge the documents. Every screen and PDF carries: “HostReady prepares documents. You review them and lodge them with the council. This is not legal advice.”

## Questions to rehearse

**What if AI gets a requirement wrong?** Verified rules and deadlines run in TypeScript. AI drafts are checked against verified council checklist items; missing organiser facts remain placeholders. The organiser reviews before lodging.

**Why can't a council build this?** Councils own their submission processes. HostReady helps organisers prepare across councils. Adding a council means publishing reviewed source data, templates and rules, followed by a real switch test.

**Who pays?** We propose $29 per event for clubs and venues. This is a pricing hypothesis until organisers actually commit to paying.

**How do you handle an outage?** The seeded stage event has a cached response path. We must prove the complete route with the network unavailable and must never serve that fixture for a different event.

## Final rehearsal gate

1. Confirm the final scenario and replace the placeholder fixture only with supplied facts; regenerate requirements and documents, then run `npm test`.
2. Confirm a Preview with `MOCK=0` completes profile → requirements → draft → check → fix → PDF → reminder → Eventbrite and the council switch. Verify the seeded outage fallback and a non-seeded negative case.
3. Verify the stage laptop, login, URL, driver and backup, then rehearse twice at five minutes. Record the actual timings and trim lines that run long.
4. Freeze deploys at 08:00 NZDT Sunday and submit before 10:00 NZDT. Daylight saving starts at 02:00 Sunday.
