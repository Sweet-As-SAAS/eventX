// One icon set, one stroke width (1.75), sized by the caller. Paths adapted from Lucide (ISC).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p,
});

export const Check = (p: P) => <svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>;
export const Cross = (p: P) => <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const Alert = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></svg>;
export const Hand = (p: P) => <svg {...base(p)}><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>;
export const Mic = (p: P) => <svg {...base(p)}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" /></svg>;
export const Lock = (p: P) => <svg {...base(p)}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const Download = (p: P) => <svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>;
export const Mail = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
export const External = (p: P) => <svg {...base(p)}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>;
export const Ticket = (p: P) => <svg {...base(p)}><path d="M3 9a3 3 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1Z" /><path d="M13 5v2M13 11v2M13 17v2" /></svg>;
export const Wand = (p: P) => <svg {...base(p)}><path d="m15 4 5 5M4 20 16 8M9 3v2M3 9h2M19 15v2M17 19h2" /></svg>;
export const Refresh = (p: P) => <svg {...base(p)}><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" /></svg>;
export const Plus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const Home = (p: P) => <svg {...base(p)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></svg>;
export const Calendar = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export const Wallet = (p: P) => <svg {...base(p)}><path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" /><path d="M16 14h.01" /></svg>;
export const Badge = (p: P) => <svg {...base(p)}><circle cx="12" cy="9" r="6" /><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7" /></svg>;
export const Doc = (p: P) => <svg {...base(p)}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /></svg>;
export const Menu = (p: P) => <svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
export const Trash = (p: P) => <svg {...base(p)}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
export const Pin = (p: P) => <svg {...base(p)}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
export const People = (p: P) => <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>;
export const Glass = (p: P) => <svg {...base(p)}><path d="M7 3h10l-1 7a4 4 0 0 1-8 0ZM12 14v7M8 21h8" /></svg>;
export const Food = (p: P) => <svg {...base(p)}><path d="M4 11h16a8 8 0 0 1-16 0ZM12 3v4M8 5v2M16 5v2" /></svg>;
export const Tent = (p: P) => <svg {...base(p)}><path d="M12 3 2 20h20L12 3ZM12 3v17M8.5 20 12 13l3.5 7" /></svg>;
export const PanelLeft = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></svg>;
export const ArrowUp = (p: P) => <svg {...base(p)}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
export const ArrowLeft = (p: P) => <svg {...base(p)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>;
export const Share = (p: P) => <svg {...base(p)}><path d="M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>;
export const Card = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M15 15h2" /></svg>;
export const IdCard = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 14h4" /></svg>;
