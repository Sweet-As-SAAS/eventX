// DEMO_MODE safety net. For the seeded demo event only: if a live call is slow or fails, serve the cached answer.
// Any other event (a judge's own, or a changed description) always runs live, so we never show the cached data by mistake.
import fixture from "../../fixtures/demo-event.json";

export const isSeeded = (ev: { description: string; council: string }) =>
  ev.council === fixture.profile.councilSlug && ev.description.trim() === fixture.description.trim();

export async function withDemoFallback<T>(live: () => Promise<T>, cached: T | null | undefined, timeoutMs = 20_000): Promise<T> {
  if (process.env.DEMO_MODE !== "1" || cached == null) return live();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      live(),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } catch (e) {
    console.warn("[demo] serving cached answer:", e);
    return cached;
  } finally {
    clearTimeout(timer);
  }
}
