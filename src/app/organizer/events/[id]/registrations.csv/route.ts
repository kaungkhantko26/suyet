import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { clientIp } from "@/lib/rate-limit";
import { ServiceError } from "@/lib/services/events";
import { exportRegistrationsCsv } from "@/lib/services/registrations";

export const dynamic = "force-dynamic";

/** CSV of responses. Only the event's organizers (or staff with events.manage) can download; every export is logged. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user.role, "event.edit.own")) return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  try {
    const { filename, csv } = await exportRegistrationsCsv(user, id, clientIp(req.headers));
    return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (e) {
    if (e instanceof ServiceError) return new NextResponse(e.code === "forbidden" ? "Forbidden" : "Not found", { status: e.code === "forbidden" ? 403 : 404 });
    throw e;
  }
}
