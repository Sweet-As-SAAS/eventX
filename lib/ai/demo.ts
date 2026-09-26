// DEMO_MODE safety net. For the seeded demo event only: if a live call is slow or fails, serve the cached answer.
// Any other event (a judge's own, or the demo event switched to another council) always runs live, so we never show the cached data by mistake.
import fixture from "../../fixtures/demo-event.json";

// Whitespace-insensitive, so line endings or double spaces from the textarea still match.
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export const isSeeded = (ev: { description: string; council: string }) =>
  ev.council === fixture.profile.councilSlug && squash(ev.description) === squash(fixture.description);

export async function withDemoFallback<T>(live: () => Promise<T>, cached: T | null | undefined, timeoutMs = 20_000): Promise<T> {
  if (process.env.DEMO_MODE !== "1" || cached == null) return live();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      live(),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } catch (e) {
    console.warn("[demo] serving cached answer:", e instanceof Error ? e.message : e);
    return cached;
  } finally {
    clearTimeout(timer);
  }
}
