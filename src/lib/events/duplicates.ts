import { normalizeUrl } from "../url";

export interface DupCandidate {
  title: string;
  organizerName?: string | null;
  sourceUrl?: string | null;
  registrationUrl?: string | null;
  startAt?: Date | null;
}
export interface DupExisting {
  id: string;
  title: string;
  organizerName?: string | null;
  sourceUrl?: string | null;
  registrationUrl?: string | null;
  startAt: Date;
}
export interface DupMatch {
  id: string;
  /** EXACT = identical official/registration URL (strong); POSSIBLE = fuzzy match needing a human. */
  confidence: "EXACT" | "POSSIBLE";
  reasons: string[];
}

export function normalizeTitle(t: string): string {
  return t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\b(20\d\d|the|a|an|of|for|in|at)\b/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string) {
  return new Set(normalizeTitle(s).split(" ").filter((w) => w.length > 1));
}

export function titleSimilarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

const DAY = 86_400_000;

/**
 * Flags likely duplicates. Never merges: identical URLs are "EXACT", everything
 * else is "POSSIBLE" and left for an admin to decide.
 */
export function findDuplicates(c: DupCandidate, existing: DupExisting[]): DupMatch[] {
  const src = normalizeUrl(c.sourceUrl);
  const reg = normalizeUrl(c.registrationUrl);
  const out: DupMatch[] = [];
  for (const e of existing) {
    const reasons: string[] = [];
    let exact = false;
    if (src && src === normalizeUrl(e.sourceUrl)) { reasons.push("same-source-url"); exact = true; }
    if (reg && reg === normalizeUrl(e.registrationUrl)) { reasons.push("same-registration-url"); exact = true; }
    const sim = titleSimilarity(c.title, e.title);
    const sameDay = c.startAt ? Math.abs(c.startAt.getTime() - e.startAt.getTime()) < DAY : false;
    const sameOrg = !!c.organizerName && !!e.organizerName && normalizeTitle(c.organizerName) === normalizeTitle(e.organizerName);
    if (sim >= 0.8) reasons.push("similar-title");
    if (sim >= 0.5 && sameDay) reasons.push("similar-title-same-day");
    if (sameOrg && sameDay && sim >= 0.3) reasons.push("same-organizer-same-day");
    if (reasons.length) out.push({ id: e.id, confidence: exact ? "EXACT" : "POSSIBLE", reasons });
  }
  return out.sort((a, b) => (a.confidence === b.confidence ? b.reasons.length - a.reasons.length : a.confidence === "EXACT" ? -1 : 1));
}
