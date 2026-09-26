// Which council a place is in, from the words the organiser types. A lookup list, not AI:
// unknown places return null and the UI asks. Only covers the councils we support.
import type { CouncilSlug } from "@/lib/schemas";

// ponytail: hand list of towns and suburbs; swap for a geocoder + council boundaries when we add councils.
const PLACES: Record<CouncilSlug, string[]> = {
  waimakariri: [
    "waimakariri", "rangiora", "kaiapoi", "oxford", "woodend", "pegasus", "waikuku", "sefton", "cust", "ohoka",
    "mandeville", "swannanoa", "fernside", "loburn", "ashley", "clarkville", "tuahiwi", "kairaki", "pines beach",
    "west eyreton", "eyrewell", "silverstream", "ravenswood",
  ],
  ccc: [
    "christchurch", "otautahi", "hagley", "riccarton", "fendalton", "merivale", "papanui", "st albans", "shirley",
    "burwood", "new brighton", "sumner", "redcliffs", "mt pleasant", "mount pleasant", "cashmere", "halswell", "hornby",
    "wigram", "addington", "sydenham", "linwood", "woolston", "ferrymead", "heathcote", "lyttelton", "akaroa",
    "diamond harbour", "little river", "banks peninsula", "belfast", "burnside", "ilam", "avonhead", "bishopdale",
    "harewood", "northwood", "parklands", "aranui", "avonside", "beckenham", "spreydon", "somerfield", "opawa",
    "waltham", "phillipstown", "edgeware", "mairehau", "marshland", "sockburn", "yaldhurst", "templeton",
    "cathedral square", "north beach", "south brighton", "spencerville", "brooklands", "strowan", "st martins",
  ],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function councilFor(place: string): CouncilSlug | null {
  const p = ` ${norm(place).replace(/[^a-z ]/g, " ")} `;
  for (const [slug, names] of Object.entries(PLACES) as [CouncilSlug, string[]][]) {
    if (names.some((n) => p.includes(` ${n} `) || p.includes(` ${n}s `))) return slug;
  }
  return null;
}

export const COUNCIL_SHORT: Record<CouncilSlug, string> = { ccc: "Christchurch City Council", waimakariri: "Waimakariri District Council" };
