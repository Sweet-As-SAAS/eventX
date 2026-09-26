"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { cx } from "./ui";
import { Alert, Check } from "./icons";

type Tone = "ok" | "error";
type Toast = { id: number; text: string; tone: Tone; leaving?: boolean };
const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), tone === "error" ? 6000 : 3500);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), (tone === "error" ? 6000 : 3500) + 160);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl bg-neutral-950 px-4 py-3 text-base text-neutral-50 shadow-lg",
              "transition-[opacity,transform] duration-150 ease-out starting:translate-y-2 starting:opacity-0",
              t.leaving && "translate-y-1 opacity-0",
            )}>
            {t.tone === "error" ? <Alert className="mt-0.5 shrink-0 text-destructive-soft" /> : <Check className="mt-0.5 shrink-0 text-success-soft" />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Every failed api.* call goes here: 401 goes to sign-in, anything else shows the API's own message. */
export function useFail() {
  const toast = useToast();
  const router = useRouter();
  return useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return router.push("/login");
    toast(e instanceof Error ? e.message : "Something went wrong. Try again.", "error");
  }, [toast, router]);
}
