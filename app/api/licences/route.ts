import { db } from "@/lib/supabase/admin";
import type { Licence } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, requireOrg, must } from "@/lib/api/server";

/** Dashboard: licences and certificates with expiry dates (PRD F15, static data allowed). */
export const GET = handler(async () => {
  const orgId = await requireOrg();
  if (MOCK()) return ok(fixture.licences);
  const rows = must(await db().from("licences").select("*").eq("org_id", orgId).order("expires_on"));
  return ok(rows.map((l: any): Licence => ({ id: l.id, type: l.type, holderName: l.holder_name, expiresOn: l.expires_on })));
});
