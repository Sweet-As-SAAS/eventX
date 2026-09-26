import { MOCK } from "@/lib/api/server";
import { supabaseServer } from "@/lib/supabase/server";

/** The signed-in person's name for the greeting and sidebar. MOCK reads DEMO_USER_NAME. Null for guests. */
export async function userName(): Promise<string | null> {
  if (MOCK()) return process.env.DEMO_USER_NAME || null;
  const { data: { user } } = await (await supabaseServer()).auth.getUser().catch(() => ({ data: { user: null } }));
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const fromEmail = user?.email?.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return meta?.full_name || meta?.name || fromEmail || null;
}
