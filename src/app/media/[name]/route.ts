import { NextResponse } from "next/server";
import { readUpload } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const f = await readUpload((await params).name);
  if (!f) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(f.data), {
    headers: { "content-type": f.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
  });
}
