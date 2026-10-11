import { createHash } from "node:crypto";
import { config } from "../config";
import { log } from "../log";

/** A tiny local denylist that works offline; the HIBP check below covers the long tail. */
const COMMON = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "qwerty123456", "iloveyou123", "letmein1234",
  "admin12345", "welcome1234", "abc1234567", "11111111111", "0123456789", "passw0rd123", "myanmar1234", "yangon12345", "mandalay123",
]);

export type BreachResult = "ok" | "breached" | "unchecked";

/**
 * Breached-password screening using the HaveIBeenPwned k-anonymity range API: only the first 5 hex chars of the SHA-1
 * leave the server. If the service is unreachable we fail OPEN (registration must not depend on a third party) and
 * report "unchecked" so it is visible in logs.
 */
export async function checkPassword(password: string, opts: { fetchImpl?: typeof fetch; enabled?: boolean } = {}): Promise<BreachResult> {
  if (COMMON.has(password.toLowerCase())) return "breached";
  const enabled = opts.enabled ?? process.env.HIBP_ENABLED === "1";
  if (!enabled) return "unchecked";
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5), suffix = sha1.slice(5);
  try {
    const res = await (opts.fetchImpl ?? fetch)(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "user-agent": `${config.brandName.replace(/\s+/g, "")}-PasswordCheck` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix && Number(count) > 0) return "breached";
    }
    return "ok";
  } catch (e) {
    log("warn", "breached-password check unavailable", { error: String(e) });
    return "unchecked";
  }
}
