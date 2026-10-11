import type { Prisma, SecuritySeverity } from "@prisma/client";
import { db } from "../db";
import { enqueue } from "../jobs";
import { log } from "../log";
import { ipHash } from "./ip";

export interface SecurityEventInput {
  type: string;
  severity?: SecuritySeverity;
  outcome?: "success" | "failure" | "blocked";
  actorId?: string | null;
  ip?: string | null;
  requestId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  /** Never put passwords, tokens, secrets or full request bodies here. */
  metadata?: Record<string, unknown>;
}

/**
 * Append-only security log (DB trigger forbids UPDATE/DELETE) mirrored to structured stdout.
 * HIGH/CRITICAL events also raise an alert. Logging must never break the request, so errors are swallowed.
 */
export async function recordSecurityEvent(e: SecurityEventInput) {
  const severity = e.severity ?? "INFO";
  try {
    await db.securityEvent.create({
      data: {
        type: e.type, severity, outcome: e.outcome ?? "success", actorId: e.actorId ?? null,
        ipHash: e.ip ? ipHash(e.ip) : null, requestId: e.requestId ?? null, resourceType: e.resourceType, resourceId: e.resourceId ?? null,
        metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    log(severity === "INFO" || severity === "LOW" ? "info" : "warn", `security:${e.type}`, { severity, outcome: e.outcome, actorId: e.actorId, requestId: e.requestId, resourceType: e.resourceType, resourceId: e.resourceId });
    if (severity === "HIGH" || severity === "CRITICAL") {
      const bucket = Math.floor(Date.now() / 3_600_000);
      await enqueue("security-alert", { kind: e.type, severity, resourceType: e.resourceType ?? null }, { dedupeKey: `alert:${e.type}:${severity}:${bucket}` });
    }
  } catch (err) {
    log("error", "failed to record security event", { type: e.type, error: String(err) });
  }
}
