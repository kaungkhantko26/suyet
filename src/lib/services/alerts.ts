import type { SecuritySeverity } from "@prisma/client";
import { config } from "../config";
import { db } from "../db";
import { log } from "../log";

/**
 * Creates (or de-duplicates, per hour) an alert and pushes a MINIMAL notification to the configured channel.
 * The message names the kind and severity only: no user data, tokens or request contents.
 * ALERT_WEBHOOK_URL accepts a Slack-compatible/ntfy/Telegram-proxy endpoint that takes {"text": "..."}.
 */
export async function raiseAlert(kind: string, severity: SecuritySeverity, summary: string, windowKey = `${kind}:${severity}:${Math.floor(Date.now() / 3_600_000)}`) {
  try {
    await db.securityAlert.create({ data: { kind, severity, summary, windowKey } });
  } catch {
    return false; // already raised for this window
  }
  const url = process.env.ALERT_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `[${config.brandName}] ${severity} security alert: ${kind}. Review: ${config.appUrl}/admin/security` }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      log("error", "alert delivery failed", { kind, error: String(e) });
    }
  } else {
    log("warn", "security alert (no ALERT_WEBHOOK_URL configured)", { kind, severity });
  }
  return true;
}

/** Threshold scans over the append-only security log (run by the worker every 5 minutes). */
export async function scanSecurityEvents(now = new Date()) {
  const since = new Date(now.getTime() - 15 * 60_000);
  const bucket = Math.floor(now.getTime() / (15 * 60_000));
  const count = (type: string) => db.securityEvent.count({ where: { type, createdAt: { gte: since } } });
  const [loginFail, apiFail, denied, rateLimited] = await Promise.all([count("auth.login_failed"), count("internal_api.auth_failed"), count("authz.denied"), count("auth.login_rate_limited")]);
  const raised: string[] = [];
  const check = async (n: number, threshold: number, kind: string, severity: SecuritySeverity, text: string) => {
    if (n >= threshold && (await raiseAlert(kind, severity, `${text} (${n} in 15 min)`, `${kind}:${bucket}`))) raised.push(kind);
  };
  await check(loginFail, 20, "auth.login_failure_spike", "HIGH", "Spike in failed logins");
  await check(rateLimited, 10, "auth.login_throttling_spike", "MEDIUM", "Many throttled login attempts");
  await check(apiFail, 5, "internal_api.auth_failure_spike", "HIGH", "Repeated automation API authentication failures");
  await check(denied, 8, "authz.denied_spike", "MEDIUM", "Repeated access-denied events");
  return raised;
}
