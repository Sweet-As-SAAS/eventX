import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { userName } from "@/components/user";

// Workspace shell: sidebar on the left, the work in the middle.
export default async function ScreensLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar name={await userName()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
