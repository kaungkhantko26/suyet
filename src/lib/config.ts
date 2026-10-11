export const config = {
  /** Product/display name. Temporary: "Su Yet" for now; change BRAND_NAME (or this default) later as needed. */
  brandName: process.env.BRAND_NAME ?? "Su Yet",
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  timezone: "Asia/Yangon",
  utcOffset: "+06:30",
  pageSize: 12,
} as const;

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
