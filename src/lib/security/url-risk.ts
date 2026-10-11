import net from "node:net";
import { isPrivateIp } from "../ssrf";

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export interface RiskIndicator { code: string; severity: Severity; detail: string; field?: string }

const SEVERITY_WEIGHT: Record<Severity, number> = { info: 0, low: 1, medium: 3, high: 6, critical: 12 };
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rebrand.ly", "ow.ly", "buff.ly", "shorturl.at", "tiny.cc", "rb.gy", "bit.do", "lnkd.in", "t.ly"]);
const RISKY_TLDS = new Set(["zip", "mov", "tk", "ml", "ga", "cf", "gq", "top", "click", "country", "kim", "work", "loan"]);
const SUSPICIOUS_WORDS = /(login|signin|verify|secure|account|wallet|airdrop|giveaway|claim|bonus|password|update-?info)/i;
const FORM_PLATFORMS = ["forms.gle", "docs.google.com", "forms.office.com", "typeform.com", "airtable.com", "jotform.com", "tally.so", "eventbrite.com", "luma.com", "lu.ma", "forms.microsoft.com"];

/** Naive registrable domain (last two labels; good enough for comparison, not for security decisions). */
const registrable = (host: string) => host.split(".").slice(-2).join(".");

/**
 * Static, offline URL assessment. Produces INDICATORS for a human reviewer. It can only add suspicion: the absence of
 * indicators never means "safe", and nothing here can mark an event verified or approved.
 */
export function assessUrl(raw: string | null | undefined, field = "url", opts: { relatedHost?: string; allowHttp?: boolean } = {}): RiskIndicator[] {
  if (!raw) return [];
  const out: RiskIndicator[] = [];
  const add = (code: string, severity: Severity, detail: string) => out.push({ code, severity, detail, field });
  let u: URL;
  try { u = new URL(raw); } catch { return [{ code: "invalid-url", severity: "high", detail: "Not a valid URL", field }]; }

  if (!["https:", "http:"].includes(u.protocol)) add("blocked-scheme", "critical", `Scheme ${u.protocol} is not allowed`);
  else if (u.protocol === "http:" && !opts.allowHttp) add("insecure-http", "medium", "Plain HTTP link: needs an explicit reviewer decision");
  if (u.username || u.password) add("credentials-in-url", "high", "URL embeds credentials (common in phishing)");

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || host === "metadata.google.internal") add("blocked-destination", "critical", "Points at a local/internal name");
  if (net.isIP(host)) add(isPrivateIp(host) ? "blocked-destination" : "ip-literal-host", isPrivateIp(host) ? "critical" : "high", isPrivateIp(host) ? "Private, loopback or metadata address" : "Raw IP address instead of a domain");
  if (host.split(".").some((l) => l.startsWith("xn--"))) add("punycode-idn", "medium", "Internationalised domain (possible look-alike characters)");
  if (SHORTENERS.has(host)) add("url-shortener", "high", "Link shortener hides the real destination");
  const tld = host.split(".").pop() ?? "";
  if (RISKY_TLDS.has(tld)) add("risky-tld", "low", `Domain ending .${tld} is frequently abused`);
  if (host.split(".").length >= 5) add("many-subdomains", "low", "Unusually deep subdomain nesting");
  if (SUSPICIOUS_WORDS.test(host)) add("suspicious-keywords", "medium", "Domain contains credential/giveaway keywords");
  if (u.port && !["80", "443"].includes(u.port)) add("non-standard-port", "low", `Port ${u.port}`);
  if (FORM_PLATFORMS.some((p) => host === p || host.endsWith(`.${p}`))) add("third-party-form", "info", "Third-party form platform: it will collect participants' personal data");
  if (opts.relatedHost && registrable(host) !== registrable(opts.relatedHost)) add("domain-differs-from-source", "info", `Different domain from the official source (${opts.relatedHost})`);
  return out;
}

export type WebRiskResult = { status: "threat"; threatTypes: string[] } | { status: "no-threat-detected" } | { status: "unchecked"; reason: string };

/**
 * Optional Google Web Risk lookup (set GOOGLE_WEB_RISK_API_KEY; mind the provider's licence/usage terms).
 * "no-threat-detected" is deliberately NOT called "safe". Failures are reported as "unchecked", never as clean.
 */
export async function webRiskLookup(url: string, opts: { apiKey?: string; fetchImpl?: typeof fetch } = {}): Promise<WebRiskResult> {
  const key = opts.apiKey ?? process.env.GOOGLE_WEB_RISK_API_KEY;
  if (!key) return { status: "unchecked", reason: "provider-not-configured" };
  try {
    const q = new URLSearchParams({ uri: url, key });
    for (const t of ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]) q.append("threatTypes", t);
    const res = await (opts.fetchImpl ?? fetch)(`https://webrisk.googleapis.com/v1/uris:search?${q}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { status: "unchecked", reason: `http-${res.status}` };
    const data = (await res.json()) as { threat?: { threatTypes?: string[] } };
    return data.threat ? { status: "threat", threatTypes: data.threat.threatTypes ?? [] } : { status: "no-threat-detected" };
  } catch {
    return { status: "unchecked", reason: "provider-error" };
  }
}

export interface RiskReport {
  generatedAt: string;
  indicators: RiskIndicator[];
  score: number;
  hasCritical: boolean;
  webRisk: Record<string, WebRiskResult>;
  note: string;
}

export const riskScore = (ind: RiskIndicator[]) => ind.reduce((n, i) => n + SEVERITY_WEIGHT[i.severity], 0);

export async function buildRiskReport(input: {
  urls: { field: string; url: string | null | undefined }[];
  sourceUrl?: string | null;
  organizer?: { status: string; contactEmail?: string | null; website?: string | null };
  extra?: RiskIndicator[];
  allowHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<RiskReport> {
  const sourceHost = input.sourceUrl ? safeHost(input.sourceUrl) : undefined;
  const indicators: RiskIndicator[] = [...(input.extra ?? [])];
  const webRisk: Record<string, WebRiskResult> = {};
  for (const { field, url } of input.urls) {
    if (!url) continue;
    indicators.push(...assessUrl(url, field, { relatedHost: field === "registrationUrl" ? sourceHost : undefined, allowHttp: input.allowHttp }));
    webRisk[field] = await webRiskLookup(url, { fetchImpl: input.fetchImpl });
    if (webRisk[field].status === "threat") indicators.push({ code: "threat-intelligence-hit", severity: "critical", field, detail: `Flagged by threat intelligence: ${(webRisk[field] as { threatTypes: string[] }).threatTypes.join(", ")}` });
  }
  const o = input.organizer;
  if (o) {
    if (o.status !== "VERIFIED") indicators.push({ code: "organizer-unverified", severity: "medium", detail: "Organizer has not been verified by an administrator" });
    const mailDomain = o.contactEmail?.split("@")[1]?.toLowerCase();
    const siteHost = o.website ? safeHost(o.website) : undefined;
    if (mailDomain && siteHost && registrable(mailDomain) !== registrable(siteHost)) indicators.push({ code: "organizer-email-domain-mismatch", severity: "low", detail: "Contact email domain differs from the organizer website (does not by itself prove or disprove authorization)" });
  }
  return {
    generatedAt: new Date().toISOString(), indicators, score: riskScore(indicators), hasCritical: indicators.some((i) => i.severity === "critical"), webRisk,
    note: "Automated indicators for a human reviewer. They never grant approval or verified status; a clean result is not proof of legitimacy.",
  };
}

function safeHost(u: string) { try { return new URL(u).hostname.toLowerCase(); } catch { return undefined; } }
