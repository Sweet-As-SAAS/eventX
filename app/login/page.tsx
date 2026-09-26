"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Wordmark } from "@/components/brand";
import { Button, Title } from "@/components/ui";

// Email magic link (PRD F1) plus a one-click guest login so judges can try it without checking email.
// Supabase: enable Anonymous sign-ins, and add <APP_URL>/auth/callback to the redirect URLs (docs/SETUP.md).
export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState<"email" | "guest" | null>(null);

  async function sendLink(form: FormData) {
    setBusy("email");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: String(form.get("email")),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(null);
    setMessage(error ? { text: error.message, error: true } : { text: "Check your email for a sign-in link.", error: false });
  }

  async function guest() {
    setBusy("guest");
    const { error } = await supabaseBrowser().auth.signInAnonymously();
    if (error) {
      setBusy(null);
      setMessage({ text: error.message, error: true });
    } else router.push("/new");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 sm:px-6">
      <Wordmark />
      <div className="mt-16 space-y-8">
        <Title sub="Your events and licences are saved to your team, ready for next year.">Sign in</Title>
        <form action={sendLink} className="space-y-3">
          <label htmlFor="email" className="block text-base font-semibold text-foreground">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com"
            className="block min-h-12 w-full rounded-lg border border-neutral-300 bg-background px-4 text-lg text-foreground placeholder:text-neutral-500 focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100" />
          <Button type="submit" busy={busy === "email"} disabled={!!busy} className="min-h-12 w-full">Email me a sign-in link</Button>
        </form>
        <div className="flex items-center gap-4 text-sm text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-2">
          <Button variant="secondary" busy={busy === "guest"} disabled={!!busy} onClick={guest} className="min-h-12 w-full">Try it as a guest</Button>
          <p className="text-center text-sm text-muted-foreground">No email needed. Your event stays on this device&apos;s session.</p>
        </div>
        {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-base text-destructive" : "text-base text-success"}>{message.text}</p>}
      </div>
    </div>
  );
}
