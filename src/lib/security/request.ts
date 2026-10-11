import { randomUUID } from "node:crypto";

/** Request id assigned by the edge proxy (src/proxy.ts) and echoed in logs, audit rows and API errors. */
export async function currentRequestId(): Promise<string | undefined> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get("x-request-id") ?? undefined;
  } catch {
    return undefined; // outside a request (worker, tests)
  }
}
export const newRequestId = () => randomUUID();
