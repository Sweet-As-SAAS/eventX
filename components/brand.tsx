import Link from "next/link";

/** App icon: Harbour square, Marker bar, white tick. Same drawing as app/icon.svg. */
export const Mark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="8" fill="var(--primary)" />
    <rect x="6" y="17" width="20" height="7" rx="2" fill="var(--marker)" opacity=".9" />
    <path d="M9.5 16.5 14 21l9-10" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Wordmark({ href = "/", compact = false, light = false }: { href?: string; compact?: boolean; light?: boolean }) {
  return (
    <Link href={href} className="press inline-flex min-h-11 items-center gap-2 rounded-lg" aria-label="HostReady home">
      <Mark />
      <span className={`display text-xl font-semibold tracking-[-0.02em] ${light ? "text-white" : "text-foreground"} ${compact ? "hidden sm:inline" : ""}`}>HostReady</span>
    </Link>
  );
}
