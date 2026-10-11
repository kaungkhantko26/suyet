import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getEventBySlug } from "@/lib/events/queries";
import { isRegistrationOpen } from "@/lib/event-status";
import { track } from "@/lib/services/misc";
import { isSafeExternalUrl } from "@/lib/url";
import { assessUrl } from "@/lib/security/url-risk";

/**
 * Outbound registration redirect. The destination always comes from the database
 * (never from the request), is re-validated as http(s), and the click is counted
 * without storing anything about the visitor.
 */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await getEventBySlug(slug);
  const back = NextResponse.redirect(`${config.appUrl}/events/${slug}`, 303);
  if (e?.registrationMode === "ON_PLATFORM") return NextResponse.redirect(`${config.appUrl}/events/${slug}/apply`, 303);
  if (!e?.registrationUrl || !isSafeExternalUrl(e.registrationUrl) || !isRegistrationOpen(e)) return back;
  // Last line of defence: never send a visitor to a blocked destination, even if one got into the database.
  if (assessUrl(e.registrationUrl).some((i) => i.severity === "critical")) return back;
  await track("REGISTRATION_CLICK", { eventId: e.id });
  const res = NextResponse.redirect(e.registrationUrl, 302);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
