import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // HSTS only when the site is really served over HTTPS (avoid pinning a browser to HTTPS for a misconfigured host).
  ...((process.env.APP_URL ?? "").startsWith("https:") ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const s3 = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL) : null;

// Dev only: let a phone/tablet on the same Wi-Fi load the dev server's scripts (otherwise the page renders but never hydrates,
// so menus, drawers and dropdowns do nothing). Covers private LAN ranges; add more via DEV_ALLOWED_ORIGINS="host1,host2".
const devOrigins = [
  "192.168.*.*", "10.*.*.*", "172.*.*.*", "169.254.*.*", "*.local",
  ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
];

const config: NextConfig = {
  allowedDevOrigins: devOrigins,
  images: { remotePatterns: s3 ? [{ protocol: s3.protocol.replace(":", "") as "http" | "https", hostname: s3.hostname, port: s3.port }] : [], localPatterns: [{ pathname: "/media/**" }] },
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined, // set by the Docker build
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client"],
  experimental: { serverActions: { bodySizeLimit: "6mb", allowedOrigins: process.env.APP_URL ? [new URL(process.env.APP_URL).host] : undefined } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
