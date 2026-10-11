/** Prints the current 6-digit code for the LOCAL demo staff accounts (admin, super admin, moderator). Development only. */
import { DEMO_MFA_SECRET } from "../prisma/reference-data";
import { base32Decode, hotp, totpStep } from "../src/lib/security/totp";

if (process.env.NODE_ENV === "production") throw new Error("Demo accounts do not exist in production");
const step = totpStep();
const secs = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`Demo staff 2FA code: ${hotp(base32Decode(DEMO_MFA_SECRET), step)}   (valid ~${secs}s)`);
console.log(`Manual key for an authenticator app: ${DEMO_MFA_SECRET}`);
