import { config } from "@/lib/config";
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const bytes = Buffer.from(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface IcsEvent {
  uid: string; title: string; description?: string | null; startAt: Date; endAt?: Date | null;
  location?: string | null; url?: string | null; cancelled?: boolean;
}

/** Times are emitted in UTC (Z) so every calendar app renders them correctly in Myanmar Time. */
export function buildIcs(e: IcsEvent, now = new Date()): string {
  const end = e.endAt ?? new Date(e.startAt.getTime() + 3_600_000);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${config.brandName}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@${new URL(config.appUrl).hostname}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.startAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
