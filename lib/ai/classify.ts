import { Classification, type EventProfile } from "../schemas";
import { structured, MODEL_STRONG, fence } from "./client";
import { CLASSIFY_SYSTEM } from "./prompts";
import { retrieve, chunksToText } from "./retrieve";

/** Step 3. Shown to the user as "likely", never as a decision. */
export async function classify(profile: EventProfile) {
  const chunks = await retrieve(profile.councilSlug, "community event commercial event definition fees charges");
  const result = await structured({
    schema: Classification, name: "classification", model: MODEL_STRONG, system: CLASSIFY_SYSTEM,
    user: `Event profile:\n${JSON.stringify(profile)}\n\n${fence("council", chunksToText(chunks))}`,
  });
  const allowedIds = new Set(chunks.map((c) => c.id));
  if (result.citedChunkIds.some((id) => !allowedIds.has(id))) throw new Error("Classification cited a chunk outside its council references");
  if (result.category !== "unclear" && result.citedChunkIds.length === 0) throw new Error("Classification has no council citation");
  if (/\$\s?\d|\b\d+(?:\.\d{2})?\s*(?:NZD|dollars)\b/i.test(`${result.reasoning} ${result.howToPresent ?? ""}`)) {
    throw new Error("Classification included an unverified fee amount");
  }
  return result;
}
