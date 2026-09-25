"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Email magic link (PRD F1) plus a one-click guest login so judges can try it without checking email.
// Supabase: enable Anonymous sign-ins, and add <APP_URL>/auth/callback to the redirect URLs (docs/SETUP.md).
export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function sendLink(form: FormData) {
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: String(form.get("email")),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setMessage(error ? error.message : "Check your email for a sign-in link.");
  }

  async function guest() {
    const { error } = await supabaseBrowser().auth.signInAnonymously();
    if (error) setMessage(error.message);
    else router.push("/new");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 space-y-4">
      <h1 className="text-2xl font-semibold">Sign in to HostReady</h1>
      <form action={sendLink} className="space-y-2">
        <input name="email" type="email" required placeholder="you@club.co.nz" className="w-full rounded border px-3 py-3" />
        <button className="w-full rounded bg-black px-4 py-3 text-white">Email me a sign-in link</button>
      </form>
      <button onClick={guest} className="w-full rounded border px-4 py-3">Try it as a guest</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}
