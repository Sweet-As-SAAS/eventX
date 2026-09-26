import { db } from "@/lib/supabase/admin";
import { sendReminder } from "@/lib/integrations/email";
import { addDays, nzToday } from "@/lib/deadlines";
import { ok, handler, must, HttpError } from "@/lib/api/server";

async function recipientForOrg(orgId: string): Promise<string | null> {
  const members = must(await db().from("memberships").select("user_id").eq("org_id", orgId));
  for (const member of members) {
    const { data, error } = await db().auth.admin.getUserById(member.user_id);
    if (error) throw new HttpError(500, error.message);
    if (data.user?.email) return data.user.email;
  }
  return null; // Anonymous guests have no email; the demo button uses REMINDER_TO instead.
}

/** Vercel Cron, daily (vercel.json). Sends the 14-day and 3-day reminder once each, catching up if a day was missed. */
export const GET = handler(async (req) => {
  // Vercel sends "Bearer $CRON_SECRET". Refuse outright if the secret is unset, or "Bearer undefined" would pass.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new HttpError(401, "unauthorised");
  }
  if (!process.env.APP_URL) throw new HttpError(500, "Set APP_URL for reminder links");
  const today = nzToday();
  let sent = 0;
  const recipients = new Map<string, string | null>();
  for (const [days, col] of [[14, "reminded_14_at"], [3, "reminded_3_at"]] as const) {
    const due = must(await db().from("deadlines").select("id, label, recommended, events(id, org_id, profile)")
      .gte("recommended", today).lte("recommended", addDays(today, days)).is(col, null));
    for (const d of due) {
      const ev: any = d.events;
      if (!recipients.has(ev.org_id)) recipients.set(ev.org_id, await recipientForOrg(ev.org_id));
      const to = recipients.get(ev.org_id);
      if (!to) continue;
      await sendReminder(to, { eventName: ev.profile?.name?.value ?? "Your event",
        label: d.label, due: d.recommended, link: `${process.env.APP_URL}/events/${ev.id}/deadlines` });
      must(await db().from("deadlines").update({ [col]: new Date().toISOString() }).eq("id", d.id));
      sent++;
    }
  }
  return ok({ sent, today });
});
