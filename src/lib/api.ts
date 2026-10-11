import { NextResponse } from "next/server";

/** Consistent API error envelope. Never includes stack traces, SQL, secrets or environment details. */
export function apiError(status: number, code: string, message: string, requestId: string, extra: Record<string, unknown> = {}, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message, requestId, ...extra } }, { status, headers: { "x-request-id": requestId, "Cache-Control": "no-store", ...(headers ?? {}) } });
}

export const apiJson = (data: unknown, status: number, requestId: string) =>
  NextResponse.json(data, { status, headers: { "x-request-id": requestId, "Cache-Control": "no-store" } });

export const requestIdFrom = (req: Request) => {
  const h = req.headers.get("x-request-id");
  return h && /^[\w-]{8,100}$/.test(h) ? h : crypto.randomUUID();
};
