import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { OAuth2RequestError, decodeIdToken } from "arctic";
import { createSession } from "@/lib/auth/session";
import { GOOGLE_INTENT_COOKIE, GOOGLE_NEXT_COOKIE, GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, googleClient, googleEnabled } from "@/lib/auth/google";
import { findOrCreateGoogleUser, requiresSecondFactor } from "@/lib/services/auth";
import { clientIp } from "@/lib/security/ip";
import { recordSecurityEvent } from "@/lib/security/events";
import { getLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

interface GoogleIdTokenClaims { sub: string; email: string; email_verified?: boolean; name?: string }

function fail(path: string, cookiesToClear: string[]) {
  const res = NextResponse.redirect(new URL(path, process.env.APP_URL ?? "http://localhost:3000"));
  for (const c of cookiesToClear) res.cookies.delete(c);
  return res;
}

export async function GET(req: Request) {
  const ip = clientIp(await headers());
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const cookieNames = [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, GOOGLE_INTENT_COOKIE, GOOGLE_NEXT_COOKIE];
  if (!googleEnabled()) return fail("/auth/login?error=oauth", cookieNames);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = req.headers.get("cookie") ?? "";
  const read = (name: string) => cookieStore.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1];
  const savedState = read(GOOGLE_STATE_COOKIE);
  const verifier = read(GOOGLE_VERIFIER_COOKIE);
  const intent = read(GOOGLE_INTENT_COOKIE) === "organizer" ? "organizer" : "student";
  const next = read(GOOGLE_NEXT_COOKIE) ? decodeURIComponent(read(GOOGLE_NEXT_COOKIE)!) : "/dashboard";

  if (!code || !state || !savedState || !verifier || state !== savedState) {
    await recordSecurityEvent({ type: "auth.oauth_state_mismatch", severity: "MEDIUM", outcome: "blocked", ip, requestId });
    return fail("/auth/login?error=oauth", cookieNames);
  }

  try {
    const tokens = await googleClient().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;
    if (!claims.email) return fail("/auth/login?error=oauth", cookieNames);

    const locale = await getLocale();
    const res = await findOrCreateGoogleUser(
      { sub: claims.sub, email: claims.email, emailVerified: !!claims.email_verified, name: claims.name ?? claims.email.split("@")[0] },
      locale,
      { ip, requestId },
    );
    if (!res.ok) return fail(`/auth/login?error=${res.error === "suspended" ? "suspended" : "oauth"}`, cookieNames);

    const needsMfa = requiresSecondFactor(res.role, res.mfaEnrolled);
    await createSession(res.userId, req.headers.get("user-agent"), { mfaVerified: !needsMfa });

    const dest = needsMfa
      ? `${res.mfaEnrolled ? "/auth/mfa" : "/auth/mfa/setup"}?next=${encodeURIComponent(res.isNewUser ? "/auth/choose-role" : next)}`
      : res.isNewUser
        ? `/auth/choose-role?next=${encodeURIComponent(next)}${intent === "organizer" ? "&intent=organizer" : ""}`
        : next;

    const out = NextResponse.redirect(new URL(dest, process.env.APP_URL ?? "http://localhost:3000"));
    for (const c of cookieNames) out.cookies.delete(c);
    return out;
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      await recordSecurityEvent({ type: "auth.oauth_error", severity: "LOW", outcome: "failure", ip, requestId });
      return fail("/auth/login?error=oauth", cookieNames);
    }
    throw e;
  }
}
