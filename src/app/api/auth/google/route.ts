import { NextResponse } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import {
  GOOGLE_INTENT_COOKIE, GOOGLE_NEXT_COOKIE, GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE,
  googleClient, googleEnabled,
} from "@/lib/auth/google";
import { safeRedirectPath } from "@/lib/url";

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 600; // 10 minutes: just long enough for the Google consent round-trip

/** Starts the Google OAuth flow. ?next=/path to return to; ?intent=organizer only affects a brand-new signup. */
export async function GET(req: Request) {
  if (!googleEnabled()) return NextResponse.json({ error: "google_disabled" }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const next = safeRedirectPath(searchParams.get("next"));
  const intent = searchParams.get("intent") === "organizer" ? "organizer" : "student";

  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = googleClient().createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);

  const res = NextResponse.redirect(url);
  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: COOKIE_MAX_AGE };
  res.cookies.set(GOOGLE_STATE_COOKIE, state, base);
  res.cookies.set(GOOGLE_VERIFIER_COOKIE, verifier, base);
  res.cookies.set(GOOGLE_INTENT_COOKIE, intent, base);
  res.cookies.set(GOOGLE_NEXT_COOKIE, next, base);
  return res;
}
