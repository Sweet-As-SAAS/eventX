import Link from "next/link";
import { useId } from "react";

/** App icon: three tightly stacked cards, navy front to light-blue back. Same drawing as app/icon.svg. */
export const Mark = ({ size = 28 }: { size?: number }) => {
  const id = useId(); // unique gradient ids: a url(#id) into a hidden duplicate svg won't paint
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#2E45F0" /><stop offset="1" stopColor="#A9C6FF" /></linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#1A22D8" /><stop offset="1" stopColor="#3D55F5" /></linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#05086E" /><stop offset="1" stopColor="#1414EC" /></linearGradient>
      </defs>
      <rect x="8" y="1" width="23" height="23" rx="3.6" fill={`url(#${id}b)`} />
      <rect x="4.5" y="4.5" width="23" height="23" rx="3.6" fill={`url(#${id}m)`} />
      <rect x="1" y="8" width="23" height="23" rx="3.6" fill={`url(#${id}f)`} />
    </svg>
  );
};

/** Logotype: lowercase "evnt", spaced capital X, Poppins SemiBold in brand navy. */
export const Logotype = ({ light = false, className = "" }: { light?: boolean; className?: string }) => (
  <span className={`font-logo font-semibold leading-none tracking-[-0.01em] ${light ? "text-white" : "text-[#0B3A8C]"} ${className}`}>
    evnt<span className="ml-[0.14em]">X</span>
  </span>
);

export function Wordmark({ href = "/", compact = false, light = false }: { href?: string; compact?: boolean; light?: boolean }) {
  return (
    <Link href={href} className="press inline-flex min-h-11 items-center gap-2.5 rounded-lg" aria-label="EvntX home">
      <Mark />
      <Logotype light={light} className={`text-2xl ${compact ? "hidden sm:inline" : ""}`} />
    </Link>
  );
}
