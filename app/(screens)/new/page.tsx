"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { CouncilSlug } from "@/lib/schemas";

// Screen 1, Describe. Working reference for the pattern every screen follows:
// call lib/api/client.ts, show a busy state while waiting, show the error message if it fails.
// Lane D: restyle to the mockup, add voice input and "start from a past event".
export default function DescribePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createEvent({
        council: form.get("council") as CouncilSlug,
        description: String(form.get("description")),
      });
      router.push(`/events/${id}/profile`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="mx-auto max-w-2xl px-4 py-10 space-y-4">
      <h1 className="text-2xl font-semibold">Describe your event</h1>
      <textarea name="description" required minLength={10} maxLength={2000} rows={8} className="w-full rounded border p-3"
        placeholder="What is it, where, when, and roughly how many people? Mention anything like alcohol, food stalls, marquees, rides, music or road closures." />
      <label className="block">
        Council
        <select name="council" className="ml-2 rounded border px-2 py-2">
          <option value="ccc">Christchurch City Council</option>
          <option value="waimakariri">Waimakariri District Council</option>
        </select>
      </label>
      <button disabled={busy} className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">
        {busy ? "Saving…" : "Continue"}
      </button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </form>
  );
}
