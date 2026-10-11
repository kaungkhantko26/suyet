import { createHmac } from "node:crypto";

/**
 * Client address as seen by the trusted reverse proxy. Nginx OVERWRITES X-Real-IP / X-Forwarded-For with $remote_addr
 * (it never appends client-supplied values) and is the only published port, so these headers cannot be forged by clients.
 * Without a proxy (local dev) every caller shares the "unknown" bucket, which is harmless.
 * If X-Forwarded-For does carry a chain we use the RIGHT-most entry (the one added by our own proxy).
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return xff?.length ? xff[xff.length - 1] : "unknown";
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return s ?? "dev-only-secret";
}

/** Keyed hash so logs can correlate abuse without storing raw addresses (personal data). */
export const ipHash = (ip: string) => createHmac("sha256", secret()).update(ip).digest("hex").slice(0, 16);
