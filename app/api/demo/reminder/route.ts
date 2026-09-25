import { sendReminder } from "@/lib/integrations/email";
import { ok, fixture, handler, requireOrg, MOCK, HttpError } from "@/lib/api/server";

/** Demo only (DEMO_MODE=1): sends the demo event's soonest deadline reminder now so judges watch it land. */
export const POST = handler(async () => {
  if (process.env.DEMO_MODE !== "1") throw new HttpError(404, "Not found");
  await requireOrg();
  if (MOCK()) return ok({ ok: true });
  if (!process.env.REMINDER_TO) throw new HttpError(500, "Set REMINDER_TO");
  const d = fixture.deadlines[0]; // sorted by recommended date
  if (!d) throw new HttpError(500, "The demo fixture has no deadlines");
  await sendReminder(process.env.REMINDER_TO, { eventName: fixture.profile.name.value, label: d.label, due: d.recommended,
    link: `${process.env.APP_URL ?? ""}/dashboard` });
  return ok({ ok: true });
});
