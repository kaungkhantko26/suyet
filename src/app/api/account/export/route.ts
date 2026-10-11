import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { exportAccountData } from "@/lib/services/account";
import { recordSecurityEvent } from "@/lib/security/events";

export const dynamic = "force-dynamic";

/** Authenticated data export for the signed-in user only (identity comes from the session, never from the request). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: "unauthorized", message: "Please log in" } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const data = await exportAccountData(user.id);
  await recordSecurityEvent({ type: "account.exported", actorId: user.id, resourceType: "User", resourceId: user.id });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="letstech-account-export.json"', "Cache-Control": "no-store" },
  });
}
