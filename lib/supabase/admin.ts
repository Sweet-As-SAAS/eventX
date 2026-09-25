// Service-role client: bypasses RLS. Server only (route handlers, cron, scripts). Never import into a client component.
// Every app-table query made with it must filter by the caller's org (see requireOrg / loadEvent in lib/api/server.ts).
import { createClient } from "@supabase/supabase-js";

export const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
