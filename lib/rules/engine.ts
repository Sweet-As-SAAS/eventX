// Deterministic rules engine. No AI here. Only verified rules are evaluated.
import type { EventProfile, Requirement, DocumentType, CouncilSlug } from "../schemas";

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { path: string; eq?: unknown; gt?: number; gte?: number; truthy?: boolean };

export interface Rule {
  id: string;
  council: CouncilSlug;
  condition: Condition;
  outcome: { documentType: DocumentType; reason: string };
  sourceUrl: string;
  sourceQuote: string;
  lastChecked: string | null;
  verified: boolean;
}

/** Reads a dot path. Unwraps {value, source} field objects to their value. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const key of path.split(".")) cur = cur?.[key];
  if (cur && typeof cur === "object" && "value" in cur && "source" in cur) return cur.value;
  return cur;
}

export function evaluate(c: Condition, profile: EventProfile): boolean {
  if ("all" in c) return c.all.every((x) => evaluate(x, profile));
  if ("any" in c) return c.any.some((x) => evaluate(x, profile));
  const v = getPath(profile, c.path);
  if (c.truthy !== undefined) return Boolean(v) === c.truthy;
  if (c.eq !== undefined) return v === c.eq;
  if (c.gt !== undefined) return typeof v === "number" && v > c.gt;
  if (c.gte !== undefined) return typeof v === "number" && v >= c.gte;
  return false;
}

/** Paths a rule depends on. Used to decide which missing fields deserve a follow-up question. */
export function conditionPaths(c: Condition): string[] {
  if ("all" in c) return c.all.flatMap(conditionPaths);
  if ("any" in c) return c.any.flatMap(conditionPaths);
  return [c.path];
}

export function requiredDocuments(profile: EventProfile, rules: Rule[]): Requirement[] {
  const out = new Map<DocumentType, Requirement>();
  for (const r of rules) {
    if (!r.verified || r.council !== profile.councilSlug) continue;
    if (!evaluate(r.condition, profile)) continue;
    if (!out.has(r.outcome.documentType)) {
      out.set(r.outcome.documentType, {
        documentType: r.outcome.documentType,
        reason: r.outcome.reason,
        ruleId: r.id,
        sourceUrl: r.sourceUrl,
        lastChecked: r.lastChecked,
      });
    }
  }
  return [...out.values()];
}
