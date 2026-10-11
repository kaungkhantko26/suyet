import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getEventBySlug } from "@/lib/events/queries";
import { buildIcs } from "@/lib/ics";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await getEventBySlug(slug);
  if (!e) return new NextResponse("Not found", { status: 404 });
  const body = buildIcs({
    uid: e.id, title: e.title, description: `${e.shortDescription}\n${config.appUrl}/events/${e.slug}`,
    startAt: e.startAt, endAt: e.endAt, cancelled: e.cancelled, url: `${config.appUrl}/events/${e.slug}`,
    location: e.format === "ONLINE" ? "Online" : [e.venue, e.city, e.location?.nameEn].filter(Boolean).join(", "),
  });
  return new NextResponse(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.slug}.ics"` } });
}
