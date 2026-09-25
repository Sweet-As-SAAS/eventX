import { db } from "../supabase/admin";
import { embed } from "./client";
import type { CouncilSlug } from "../schemas";

export interface Chunk { id: string; heading: string; content: string; url: string }

/** Top-k chunks for one council from our own knowledge base. Never touches the web. */
export async function retrieve(council: CouncilSlug, query: string, k = 5): Promise<Chunk[]> {
  const [embedding] = await embed([query]);
  const { data, error } = await db().rpc("match_kb_chunks", { council_slug: council, query_embedding: embedding, match_count: k });
  if (error) throw new Error(error.message);
  return data as Chunk[];
}

export const chunksToText = (chunks: Chunk[]) =>
  chunks.map((c) => `[chunk ${c.id}] ${c.heading}\n${c.content}\nSource: ${c.url}`).join("\n\n");
