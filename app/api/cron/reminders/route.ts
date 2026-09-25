import { db } from "@/lib/supabase/admin";
import { sendReminder } from "@/lib/integrations/email";
import { addDays, nzToday } from "@/lib/deadlines";
import { ok, handler, must, HttpError } from "@/lib/api/server";

/** Vercel Cron, daily (vercel.json). Sends the 14-day and 3-day reminder once each, catching up if a day was missed. */
export const GET = handler(async (req) => {
  // Vercel sends "Bearer $CRON_SECRET". Refuse outright if the secret is unset, or "Bearer undefined" would pass.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new HttpError(401, "unauthorised");
  }
  const today = nzToday();
  let sent = 0;
  for (const [days, col] of [[14, "reminded_14_at"], [3, "reminded_3_at"]] as const) {
    const due = must(await db().from("deadlines").select("id, label, recommended, events(id, profile)")
      .gte("recommended", today).lte("recommended", addDays(today, days)).is(col, null));
    for (const d of due) {
      const ev: any = d.events;
      // ponytail: every reminder goes to REMINDER_TO; store an org contact email when real orgs sign up
      await sendReminder(process.env.REMINDER_TO!, { eventName: ev.profile?.name?.value ?? "Your event",
        label: d.label, due: d.recommended, link: `${process.env.APP_URL}/events/${ev.id}/deadlines` });
      must(await db().from("deadlines").update({ [col]: new Date().toISOString() }).eq("id", d.id));
      sent++;
    }
  }
  return ok({ sent, today });
});
