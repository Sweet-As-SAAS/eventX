import { Classification, type EventProfile } from "../schemas";
import { structured, MODEL_STRONG, fence } from "./client";
import { CLASSIFY_SYSTEM } from "./prompts";
import { retrieve, chunksToText } from "./retrieve";

/** Step 3. Shown to the user as "likely", never as a decision. */
export async function classify(profile: EventProfile) {
  const chunks = await retrieve(profile.councilSlug, "community event commercial event definition fees charges");
  return structured({
    schema: Classification, name: "classification", model: MODEL_STRONG, system: CLASSIFY_SYSTEM,
    user: `Event profile:\n${JSON.stringify(profile)}\n\n${fence("council", chunksToText(chunks))}`,
  });
}
