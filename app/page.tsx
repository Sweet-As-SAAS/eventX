import Link from "next/link";

// Lane D: landing page. Keep it one screen: who it is for, the one-line pitch, one button.
export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 space-y-6">
      <h1 className="text-4xl font-semibold">HostReady</h1>
      <p className="text-lg">
        Describe your event once, and HostReady produces your council permit paperwork, safety plan, site plan and
        liquor licence application, ready to lodge.
      </p>
      <div className="flex gap-3">
        <Link href="/new" className="rounded bg-black px-4 py-3 text-white">Describe your event</Link>
        <Link href="/dashboard" className="rounded border px-4 py-3">Dashboard</Link>
      </div>
    </div>
  );
}
