import "server-only";
import { Google } from "arctic";
import { config } from "../config";

export const GOOGLE_STATE_COOKIE = "lte_oauth_state";
export const GOOGLE_VERIFIER_COOKIE = "lte_oauth_verifier";
export const GOOGLE_INTENT_COOKIE = "lte_oauth_intent";
export const GOOGLE_NEXT_COOKIE = "lte_oauth_next";

export function googleEnabled(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Lazy: only throws if a route actually tries to use Google sign-in without it configured. */
export function googleClient(): Google {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google sign-in is not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)");
  return new Google(id, secret, `${config.appUrl}/api/auth/google/callback`);
}
