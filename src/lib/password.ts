import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

/**
 * Argon2id, OWASP-recommended minimum profile (19 MiB, 2 iterations, 1 lane). Tune upward on larger servers:
 * raise ARGON2_MEMORY_KIB while keeping a login under ~250 ms on the production VPS.
 * The salt is random per hash and embedded in the PHC string.
 */
const ARGON = {
  algorithm: 2 as const, // Argon2id
  memoryCost: Number(process.env.ARGON2_MEMORY_KIB ?? 19456),
  timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
  parallelism: 1,
};

export const PASSWORD_MIN = 10;
/** Long passphrases are welcome; the cap only prevents hashing-based resource abuse. */
export const PASSWORD_MAX = 256;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON);
}

// A syntactically valid hash of a random password, used to keep timing similar for unknown accounts.
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= argonHash(randomBytes(16).toString("hex"), ARGON));

function legacyScrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))),
  );
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    await argonVerify(await dummyHash(), password).catch(() => false); // equalise timing
    return false;
  }
  if (stored.startsWith("$argon2")) return argonVerify(stored, password).catch(() => false);
  if (stored.startsWith("scrypt$")) {
    // Legacy hashes from the first release. Verified here, upgraded to Argon2id on next login (see needsRehash).
    const p = stored.split("$");
    const expected = Buffer.from(p[5] ?? "", "base64");
    const actual = await legacyScrypt(password, Buffer.from(p[4] ?? "", "base64"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  return false;
}

export const needsRehash = (stored: string | null) => !!stored && !stored.startsWith("$argon2id$");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
