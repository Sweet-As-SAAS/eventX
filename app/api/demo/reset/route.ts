import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MOCK, HttpError, handler } from "@/lib/api/server";

/** MOCK: wipe this browser's demo (started, fixed, ticks, edits) and land on a clean Home. Open /api/demo/reset before a demo. */
export const GET = handler(async (req) => {
  if (!MOCK()) throw new HttpError(404, "Only in demo mode");
  const response = NextResponse.redirect(new URL("/dashboard", req.url));
  for (const c of (await cookies()).getAll()) if (c.name.startsWith("evntx_demo_")) response.cookies.delete(c.name);
  return response;
});
