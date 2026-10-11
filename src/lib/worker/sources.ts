import { db } from "../db";
import { safeFetch } from "../ssrf";
import { isSwitchOn } from "../services/switches";

/** Minimal robots.txt check for our user agent (Disallow prefixes under "User-agent: *" or our bot). */
export function robotsAllows(robotsTxt: string, path: string, agent = "letstecheventsbot"): boolean {
  let applies = false;
  const disallow: string[] = [];
  for (const raw of robotsTxt.split("\n")) {
    const line = raw.split("#")[0].trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) applies = v === "*" || v.toLowerCase().includes(agent);
    else if (applies && /^disallow$/i.test(k) && v) disallow.push(v);
  }
  return !disallow.some((d) => path.startsWith(d));
}

const FAILURES_BEFORE_FLAG = 3;

/**
 * Reachability check for registered sources. Honors robots.txt and uses SSRF-safe fetching.
 * After repeated failures the source is marked UNREACHABLE and the events that rely on it are flagged NEEDS_REVIEW.
 */
export async function checkSources(limit = 20) {
  if (await isSwitchOn("automation_paused")) return { checked: 0, flagged: 0, paused: true };
  const sources = await db.eventSource.findMany({
    where: { status: { in: ["ACTIVE", "ERROR", "UNREACHABLE"] }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 6 * 3_600_000) } }] },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let flagged = 0;
  for (const s of sources) {
    let ok = false;
    let error: string | null = null;
    try {
      const u = new URL(s.url);
      let allowed = true;
      try {
        const robots = await safeFetch(`${u.origin}/robots.txt`, { maxBytes: 100_000, timeoutMs: 5000 });
        if (robots.ok) allowed = robotsAllows(robots.body, u.pathname);
      } catch { /* no robots.txt: allowed */ }
      if (!allowed) {
        error = "Disallowed by robots.txt; not fetched";
        ok = true; // not a failure of the source
      } else {
        const res = await safeFetch(s.url, { method: "HEAD", timeoutMs: 8000 });
        ok = res.status < 400;
        if (!ok) error = `HTTP ${res.status}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "fetch failed";
    }
    const failures = ok ? 0 : s.consecutiveFailures + 1;
    const unreachable = failures >= FAILURES_BEFORE_FLAG;
    await db.eventSource.update({
      where: { id: s.id },
      data: { lastCheckedAt: new Date(), consecutiveFailures: failures, lastError: error, status: ok ? "ACTIVE" : unreachable ? "UNREACHABLE" : "ERROR" },
    });
    if (unreachable) {
      const r = await db.event.updateMany({
        where: { sourceId: s.id, deletedAt: null, verificationStatus: { in: ["VERIFIED", "UNVERIFIED", "PENDING_VERIFICATION"] } },
        data: { verificationStatus: "NEEDS_REVIEW", verificationNotes: "Official source became unavailable. Needs human review." },
      });
      flagged += r.count;
    }
    await new Promise((r) => setTimeout(r, 1000)); // be polite: 1 request/second overall
  }
  return { checked: sources.length, flagged };
}
