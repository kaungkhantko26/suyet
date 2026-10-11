import { PrismaClient, type EventFormat, type OrganizerType } from "@prisma/client";

try { process.loadEnvFile(".env"); } catch { /* optional */ }
import { hashPassword, randomToken } from "../src/lib/password";
import { encryptSecret } from "../src/lib/security/totp";
import { CATEGORIES, DEMO_MFA_SECRET, LOCATIONS } from "./reference-data";

const db = new PrismaClient();
const DAY = 86_400_000;
const HOUR = 3_600_000;

export async function seedReference() {
  for (const [i, c] of CATEGORIES.entries()) {
    await db.eventCategory.upsert({
      where: { slug: c.slug },
      update: { nameEn: c.nameEn, nameMy: c.nameMy, icon: c.icon },
      create: { ...c, sortOrder: i },
    });
  }
  for (const [i, l] of LOCATIONS.entries()) {
    await db.location.upsert({ where: { slug: l.slug }, update: { nameEn: l.nameEn, nameMy: l.nameMy, type: l.type }, create: { ...l, sortOrder: i } });
  }
}

async function ensureUser(email: string, name: string, role: "SUPER_ADMIN" | "ADMIN" | "MODERATOR" | "ORGANIZER" | "STUDENT", password: string) {
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email, name, role, emailVerified: new Date(), passwordHash: await hashPassword(password),
      profile: { create: { displayName: name } },
      notificationPreference: { create: { unsubscribeToken: randomToken(24) } },
    },
  });
  return user;
}

async function enrollDemoMfa(userId: string) {
  await db.mfaCredential.upsert({ where: { userId }, update: {}, create: { userId, secretEnc: encryptSecret(DEMO_MFA_SECRET), enabledAt: new Date() } });
}

/** Optional production bootstrap: creates the first admin from env, no demo data. */
async function seedAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw) return;
  if (pw.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  await ensureUser(email, "Administrator", "SUPER_ADMIN", pw); // first account must be able to grant other admins; MFA is enforced at first login
  console.log(`Admin account ensured for ${email}`);
}

interface DemoEvent {
  key: string; title: string; short: string; cats: string[]; org: string; loc: string; format: EventFormat;
  startIn: number; durH: number; deadlineIn?: number | null; fee?: number; featured?: boolean; skill?: "ALL_LEVELS" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  city?: string; team?: [number, number]; elig?: string; cancelled?: boolean;
}

export async function seedDemo() {
  const pw = process.env.SEED_DEMO_PASSWORD ?? "demo-password-123";
  const admin = await ensureUser("admin@demo.letstech.test", "Demo Admin", "ADMIN", pw);
  await enrollDemoMfa(admin.id);
  const sa = await ensureUser("superadmin@demo.letstech.test", "Demo Super Admin", "SUPER_ADMIN", pw);
  await enrollDemoMfa(sa.id);
  const mod = await ensureUser("moderator@demo.letstech.test", "Demo Moderator", "MODERATOR", pw);
  await enrollDemoMfa(mod.id);
  const orgUser = await ensureUser("organizer@demo.letstech.test", "Demo Organizer", "ORGANIZER", pw);
  await ensureUser("student@demo.letstech.test", "Demo Student", "STUDENT", pw);

  const orgs: Record<string, { name: string; type: OrganizerType; loc: string }> = {
    uni: { name: "Demo Institute of Technology (fictional)", type: "UNIVERSITY", loc: "yangon" },
    club: { name: "Demo Coding Club (fictional)", type: "UNIVERSITY_CLUB", loc: "mandalay" },
    community: { name: "Demo Builders Community (fictional)", type: "TECH_COMMUNITY", loc: "online" },
  };
  const orgIds: Record<string, string> = {};
  for (const [k, o] of Object.entries(orgs)) {
    const loc = await db.location.findUnique({ where: { slug: o.loc } });
    const org = await db.organizer.upsert({
      where: { slug: `demo-${k}` },
      update: {},
      create: {
        slug: `demo-${k}`, name: o.name, type: o.type, status: k === "uni" ? "VERIFIED" : "UNVERIFIED", locationId: loc?.id,
        description: "A fictional organizer created for development demo data. Not a real organization.",
        contactEmail: "hello@example.org",
      },
    });
    orgIds[k] = org.id;
    await db.organizerMember.upsert({ where: { organizerId_userId: { organizerId: org.id, userId: orgUser.id } }, update: {}, create: { organizerId: org.id, userId: orgUser.id } });
  }

  const cats = Object.fromEntries((await db.eventCategory.findMany()).map((c) => [c.slug, c.id]));
  const locs = Object.fromEntries((await db.location.findMany()).map((l) => [l.slug, l.id]));
  const now = Date.now();

  const events: DemoEvent[] = [
    { key: "campus-hack", title: "Demo Campus Hackathon 24h", short: "A fictional 24-hour hackathon for students.", cats: ["hackathons"], org: "uni", loc: "yangon", city: "Yangon", format: "ONSITE", startIn: 21, durH: 24, deadlineIn: 2, featured: true, skill: "BEGINNER", team: [2, 4], elig: "University students" },
    { key: "ai-sprint", title: "Demo AI Sprint (online)", short: "A fictional online weekend sprint building small AI tools.", cats: ["hackathons", "artificial-intelligence"], org: "community", loc: "online", format: "ONLINE", startIn: 12, durH: 48, deadlineIn: 9, featured: true, skill: "INTERMEDIATE", team: [1, 3], elig: "Open to everyone" },
    { key: "web-workshop", title: "Demo Web Basics Workshop", short: "A fictional beginner workshop on HTML, CSS and JavaScript.", cats: ["technology-workshops", "web-development"], org: "club", loc: "mandalay", city: "Mandalay", format: "ONSITE", startIn: 6, durH: 4, deadlineIn: 5, skill: "BEGINNER", elig: "Students" },
    { key: "ctf", title: "Demo Capture The Flag Night", short: "A fictional beginner-friendly CTF.", cats: ["ctf", "cybersecurity"], org: "community", loc: "online", format: "ONLINE", startIn: 30, durH: 8, deadlineIn: 25, skill: "ALL_LEVELS", team: [1, 4], elig: "Open to everyone" },
    { key: "uiux", title: "Demo UI/UX Design Challenge", short: "A fictional 3-day product design challenge.", cats: ["ui-ux-design"], org: "uni", loc: "yangon", city: "Yangon", format: "HYBRID", startIn: 40, durH: 72, deadlineIn: 33, fee: 5000, skill: "INTERMEDIATE", elig: "University students" },
    { key: "robotics", title: "Demo Robotics Showcase", short: "A fictional student robotics showcase.", cats: ["robotics", "university-events"], org: "uni", loc: "naypyidaw", city: "Naypyidaw", format: "ONSITE", startIn: 55, durH: 8, deadlineIn: 45, featured: true, elig: "Students" },
    { key: "startup", title: "Demo Startup Pitch Day", short: "A fictional pitch competition for student founders.", cats: ["startup-competitions", "entrepreneurship"], org: "community", loc: "yangon", city: "Yangon", format: "ONSITE", startIn: 18, durH: 6, deadlineIn: 1, fee: 0, skill: "ALL_LEVELS" },
    { key: "datasci", title: "Demo Data Science Bootcamp", short: "A fictional two-week data bootcamp (evenings).", cats: ["bootcamps", "data-science"], org: "club", loc: "online", format: "ONLINE", startIn: 25, durH: 14 * 24, deadlineIn: 20, fee: 25000, skill: "INTERMEDIATE" },
    { key: "meetup", title: "Demo Developer Meetup", short: "A fictional monthly developer meetup.", cats: ["developer-meetups"], org: "community", loc: "mandalay", city: "Mandalay", format: "ONSITE", startIn: 9, durH: 3, deadlineIn: null, skill: "ALL_LEVELS" },
    { key: "intl", title: "Demo International Coding Contest", short: "A fictional international online contest (placeholder).", cats: ["programming-competitions"], org: "community", loc: "international", format: "ONLINE", startIn: 33, durH: 5, deadlineIn: 30, skill: "ADVANCED", team: [1, 1] },
    { key: "conf", title: "Demo Tech Conference", short: "A fictional one-day technology conference.", cats: ["conferences"], org: "uni", loc: "shan", city: "Taunggyi", format: "ONSITE", startIn: 70, durH: 9, deadlineIn: 60, fee: 15000 },
    { key: "cancelled", title: "Demo Mobile App Day (cancelled)", short: "A fictional event shown as cancelled.", cats: ["mobile-development"], org: "club", loc: "bago", city: "Bago", format: "ONSITE", startIn: 14, durH: 6, deadlineIn: 7, cancelled: true },
    { key: "past", title: "Demo Cloud Basics (completed)", short: "A fictional event that already took place.", cats: ["cloud-computing"], org: "community", loc: "online", format: "ONLINE", startIn: -10, durH: 3, deadlineIn: -12 },
  ];

  for (const e of events) {
    const start = new Date(now + e.startIn * DAY + 3 * HOUR);
    const deadline = e.deadlineIn === undefined || e.deadlineIn === null ? null : new Date(now + e.deadlineIn * DAY + 16 * HOUR);
    const data = {
      title: e.title, shortDescription: e.short,
      description: `This is a fictional demo event created for development. It is not real and has no registration.\n\n${e.short}\n\nIt exists so the platform can be tested with realistic-looking listings.`,
      startAt: start, endAt: new Date(start.getTime() + e.durH * HOUR), registrationDeadline: deadline,
      format: e.format, city: e.city ?? null, locationId: locs[e.loc], onlineUrl: e.format === "ONSITE" ? null : "https://example.org/demo-online",
      registrationUrl: `https://example.org/demo/${e.key}/register`, sourceUrl: `https://example.org/demo/${e.key}`,
      eligibility: e.elig ?? "Open to everyone", skillLevel: e.skill ?? "ALL_LEVELS", feeAmount: e.fee ?? 0,
      teamAllowed: !!e.team, minTeamSize: e.team?.[0], maxTeamSize: e.team?.[1],
      prizes: "Fictional prizes: certificates and bragging rights.",
      requirements: "A laptop and curiosity.",
      schedule: [{ time: "09:00", title: "Opening" }, { time: "10:00", title: "Main activity" }, { time: "16:00", title: "Wrap-up" }],
      organizerId: orgIds[e.org], publishState: "PUBLISHED" as const, publishedAt: new Date(), featured: !!e.featured,
      cancelled: !!e.cancelled, isDemo: true,
    };
    const ev = await db.event.upsert({ where: { slug: `demo-${e.key}` }, update: data, create: { ...data, slug: `demo-${e.key}` } });
    await db.eventCategoryRelation.deleteMany({ where: { eventId: ev.id } });
    await db.eventCategoryRelation.createMany({ data: e.cats.map((c) => ({ eventId: ev.id, categoryId: cats[c] })) });
  }
  // A fictional event that takes registrations on this website, with a Google-Forms-style form.
  const regStart = new Date(now + 20 * DAY + 3 * HOUR);
  const regData = {
    title: "Demo On-Site Registration Workshop", shortDescription: "A fictional workshop used to try the built-in registration form.",
    description: "This is a fictional demo event. Registration happens right on this website.", startAt: regStart, endAt: new Date(regStart.getTime() + 4 * HOUR),
    registrationDeadline: new Date(now + 15 * DAY), format: "ONLINE" as const, locationId: locs["online"], onlineUrl: "https://example.org/demo-onsite",
    registrationMode: "ON_PLATFORM" as const, registrationUrl: null, sourceUrl: "https://example.org/demo/onsite", eligibility: "Students", skillLevel: "BEGINNER" as const,
    organizerId: orgIds["club"], publishState: "PUBLISHED" as const, publishedAt: new Date(), isDemo: true,
  };
  const regEvent = await db.event.upsert({ where: { slug: "demo-onsite-registration" }, update: regData, create: { ...regData, slug: "demo-onsite-registration" } });
  await db.eventCategoryRelation.deleteMany({ where: { eventId: regEvent.id } });
  await db.eventCategoryRelation.createMany({ data: [{ eventId: regEvent.id, categoryId: cats["technology-workshops"] }] });
  await db.registrationForm.deleteMany({ where: { eventId: regEvent.id } });
  await db.registrationForm.create({
    data: {
      eventId: regEvent.id, enabled: true, requireApproval: true, capacity: 3, description: "Tell us a little about yourself.", confirmationMessage: "See you there! Check your email for the joining details.",
      fields: { create: [
        { position: 0, type: "SHORT_TEXT", label: "University or school", required: true },
        { position: 1, type: "SINGLE_CHOICE", label: "Experience level", required: true, options: ["Beginner", "Intermediate", "Advanced"] },
        { position: 2, type: "MULTIPLE_CHOICE", label: "Topics you are interested in", required: false, options: ["Web", "AI", "Security"] },
        { position: 3, type: "LONG_TEXT", label: "Anything we should know?", required: false },
      ] },
    },
  });
  console.log(`Demo data ready (${events.length} fictional events). Admin user: ${admin.email}`);
}

async function main() {
  await seedReference();
  console.log(`Reference data ready (${CATEGORIES.length} categories, ${LOCATIONS.length} locations)`);
  await seedAdminFromEnv();
  if (process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1") await seedDemo();
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main().finally(() => db.$disconnect());
}
