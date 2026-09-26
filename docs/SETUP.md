# Setup: the first 45 minutes

Everyone does part 1. Lane C does parts 2 to 4 while everyone else starts their lane on `MOCK=1`. Part 5 is for later.

## 1. Every laptop (5 minutes)

Needs Node 22+ and git.

```bash
git clone https://github.com/<you>/hostready.git
cd hostready
npm install
cp .env.example .env.local        # Windows PowerShell: copy .env.example .env.local
npm run dev                       # open http://localhost:3000/new, type anything, press Continue
npm test && npm run typecheck     # 35 tests pass
```

Keep `MOCK=1` in `.env.local` until your lane's real calls are ready. MOCK skips login and every route serves the fixture.

> Windows and OneDrive: if the repo lives in a OneDrive folder, OneDrive will try to sync `node_modules` and `.next` (hundreds of MB) and can lock files during builds. Clone into a folder outside OneDrive (for example `C:\dev\hostready`), or right-click the folder and pick "Free up space" / exclude it.

Then start your coding agent in the repo root and paste the "First prompt" from your lane brief in `docs/lanes/`.

## 2. GitHub (lane C, 5 minutes)

1. Create the repo on GitHub (private for now). Push `main`.
2. Invite the three teammates as collaborators.
3. Settings > Branches > add a rule for `main`: require a pull request and require the `CI / check` status. Leave approvals at 0 so merges stay fast.
4. Before submission (Sunday 8 to 10am): make the repo public, or invite `justus-lumin` (justus.huneke@luminpdf.com). Run the secrets scan first (lane C brief, step 8).

## 3. Supabase (lane C, 15 minutes)

1. New project, **region Sydney (ap-southeast-2)** so it sits next to the Vercel functions in `syd1`. Save the database password somewhere safe.
2. SQL editor > paste and run, in order, `supabase/migrations/0001_init.sql`, `0002_membership_user_unique.sql` and `0003_ccc_only.sql`. Together they create every table, the vector search function, RLS, the CCC council row (the only council) and the private `kb` storage bucket.
3. Project settings > API keys: copy the URL, the anon (or publishable) key and the service_role (or secret) key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   Send the three values to teammates privately (never in the repo, never in a public channel). Lane B needs them for ingestion.
4. Authentication > Sign In / Providers: turn on **Email** and **Anonymous sign-ins** (the "Try it as a guest" button, so judges never wait for an email).
5. Authentication > URL Configuration: Site URL = your Vercel URL. Add redirect URLs `http://localhost:3000/auth/callback` and `https://<your-app>.vercel.app/auth/callback`.
6. Supabase's built-in email sends only a handful of emails an hour. For the demo, rely on guest login, or set Authentication > SMTP to Resend (host `smtp.resend.com`, port 465, user `resend`, password = Resend API key).

## 4. Vercel (lane C with D, 10 minutes)

1. Import the GitHub repo. Framework preset Next.js, no other settings.
2. Settings > Environment Variables: add everything from `.env.example`. For the first deploy, `MOCK=1` and `DEMO_MODE=1` are enough.
3. Deploy. Check `https://<app>.vercel.app/api/events/demo` returns JSON and `/new` loads. Post the URL in the team channel.
4. Every PR now gets a preview URL. `vercel.json` pins functions to `syd1` and schedules the reminder cron at 19:00 UTC (7 to 8am NZ).

## 5. Keys for later (lanes A and C)

| Service | Where | Env vars | Who |
| --- | --- | --- | --- |
| OpenAI | Event credits, platform.openai.com > API keys | `OPENAI_API_KEY`, `OPENAI_MODEL_FAST`, `OPENAI_MODEL_STRONG`, `OPENAI_MODEL_EMBED` (1536-dim, e.g. the model the knowledge base was embedded with) | A. Check which models the credits cover and their rate limits |
| Eventbrite | eventbrite.com > Account settings > Developer links > API keys, private token. Org id from `GET https://www.eventbriteapi.com/v3/users/me/organizations/` | `EVENTBRITE_TOKEN`, `EVENTBRITE_ORG_ID`, `EVENTBRITE_DEMO_DRAFT_URL` | C |
| Resend | resend.com > API keys | `RESEND_API_KEY`, `REMINDER_FROM`, `REMINDER_TO` | C. Without a verified domain, send from `onboarding@resend.dev` to your Resend account email |
| Cron | Any long random string | `CRON_SECRET` | C |

Switch from mock to real per environment: set `MOCK=0` (or delete it) in `.env.local` or on Vercel, then redeploy. With MOCK off, pages need sign-in and routes need the keys.
