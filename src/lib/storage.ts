import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
];

export class UploadError extends Error {}

/** Detects the real type from file contents; the client-provided type and filename are ignored. */
export function detectImage(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf)) ?? null;
}

const uploadDir = () => path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./uploads");

/**
 * Decode + re-encode. The output is a brand-new WebP built from decoded pixels, so EXIF/GPS metadata, embedded payloads,
 * polyglot tricks and malformed trailing data are dropped. Pixel and size limits stop decompression bombs.
 */
export async function sanitizeImage(buf: Buffer): Promise<Buffer> {
  try {
    return await sharp(buf, { limitInputPixels: 40_000_000, failOn: "error", sequentialRead: true })
      .rotate() // apply EXIF orientation before metadata is discarded
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(); // sharp drops metadata unless withMetadata() is requested
  } catch {
    throw new UploadError("bad-type");
  }
}

/** Validates, sanitises and stores an uploaded image (random name, fixed extension), returning the public URL. */
export async function saveImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("too-large");
  const raw = Buffer.from(await file.arrayBuffer());
  if (!detectImage(raw)) throw new UploadError("bad-type"); // real content must be PNG/JPEG/WebP; extension and MIME are ignored
  const buf = await sanitizeImage(raw);
  const name = `${randomBytes(16).toString("hex")}.webp`;

  if (process.env.STORAGE_DRIVER === "s3") {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
    });
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `uploads/${name}`, Body: buf, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
    return `${(process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "")}/uploads/${name}`;
  }

  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ uploadDir(), name), buf, { mode: 0o640 });
  return `/media/${name}`;
}

export async function readUpload(name: string) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return null; // blocks path traversal
  try {
    const data = await readFile(path.join(/* turbopackIgnore: true */ uploadDir(), name));
    const kind = detectImage(data);
    return kind ? { data, mime: kind.mime } : null;
  } catch {
    return null;
  }
}
