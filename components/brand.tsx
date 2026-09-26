import Link from "next/link";
import { useId } from "react";

/** App icon: three stacked cards, navy front to light-blue back. Same drawing as app/icon.svg. */
export const Mark = ({ size = 28 }: { size?: number }) => {
  const id = useId(); // unique gradient ids: a url(#id) into a hidden duplicate svg won't paint
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#2E45F0" /><stop offset="1" stopColor="#A9C6FF" /></linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#1A22D8" /><stop offset="1" stopColor="#3D55F5" /></linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#05086E" /><stop offset="1" stopColor="#1414EC" /></linearGradient>
      </defs>
      <rect x="10" y="3" width="21" height="20" rx="3.6" fill={`url(#${id}b)`} />
      <rect x="5.5" y="6" width="21" height="20" rx="3.6" fill={`url(#${id}m)`} />
      <rect x="1" y="9" width="21" height="20" rx="3.6" fill={`url(#${id}f)`} />
    </svg>
  );
};

export function Wordmark({ href = "/", compact = false, light = false }: { href?: string; compact?: boolean; light?: boolean }) {
  return (
    <Link href={href} className="press inline-flex min-h-11 items-center gap-2 rounded-lg" aria-label="EvntX home">
      <Mark />
      <span className={`display text-xl font-semibold tracking-[-0.02em] ${light ? "text-white" : "text-foreground"} ${compact ? "hidden sm:inline" : ""}`}>EvntX</span>
    </Link>
  );
}
