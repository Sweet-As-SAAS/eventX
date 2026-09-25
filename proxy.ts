// Next 16 "proxy" (formerly middleware). Refreshes the Supabase session cookie and sends signed-out users to /login.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login"];

export async function proxy(request: NextRequest) {
  if (process.env.MOCK === "1") return NextResponse.next(); // no auth in MOCK mode
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v)); // keeps auth responses out of CDN caches
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPage = !path.startsWith("/api") && !path.startsWith("/auth") && !PUBLIC.includes(path);
  if (!user && isPage) return NextResponse.redirect(new URL("/login", request.url)); // API routes answer 401 themselves
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
