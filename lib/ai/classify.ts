import { Classification, type EventProfile } from "../schemas";
import { structured, MODEL_STRONG, fence } from "./client";
import { CLASSIFY_SYSTEM } from "./prompts";
import { retrieve, chunksToText } from "./retrieve";
import { normalizeClassification, UNCLEAR } from "./guards";
import { rangeNotes } from "./profile";

/** Step 3. Shown to the user as "likely", never as a decision. No council text, or no real citation, means "unclear". */
export async function classify(profile: EventProfile) {
  const chunks = await retrieve(profile.councilSlug, "community event commercial event definition fees charges");
  if (chunks.length === 0) return UNCLEAR;
  const raw = await structured({
    schema: Classification, name: "classification", model: MODEL_STRONG, system: CLASSIFY_SYSTEM,
    user: [
      `Event profile:\n${JSON.stringify(profile)}`,
      ...rangeNotes(profile).map((r) => `Range answer, not an exact number: ${r}`),
      fence("council", chunksToText(chunks)),
    ].join("\n\n"),
  });
  return normalizeClassification(raw, chunks);
}
