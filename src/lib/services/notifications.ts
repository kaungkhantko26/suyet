import { Prisma, type NotificationType } from "@prisma/client";
import { config } from "../config";
import { db } from "../db";
import { formatDateTime } from "../dates";
import { enqueue } from "../jobs";
import { createTranslator, isLocale } from "@/i18n";

type Tx = Prisma.TransactionClient | typeof db;

interface Target { userId: string; email: string; locale: string; emailEnabled: boolean; inAppEnabled: boolean }

/**
 * Create one notification + delivery rows per channel. `dedupeKey` is unique so the
 * same user never gets the same notification twice, even if scans overlap.
 */
export async function createNotification(
  target: Target,
  type: NotificationType,
  event: { id: string; title: string; slug: string },
  windowKey: string,
  tx: Tx = db,
) {
  const dedupeKey = `${type}:${event.id}:${target.userId}:${windowKey}`;
  const t = createTranslator(isLocale(target.locale) ? target.locale : "en");
  const title = t(`notify.${type}`, { title: event.title });
  try {
    const n = await tx.notification.create({
      data: {
        userId: target.userId, type, eventId: event.id, title,
        body: type === "REGISTRATION_APPROVED" || type === "REGISTRATION_REJECTED" ? `${config.appUrl}/dashboard/registrations` : `${config.appUrl}/events/${event.slug}`,
        dedupeKey,
        deliveries: {
          create: [
            ...(target.inAppEnabled ? [{ channel: "IN_APP" as const, status: "SENT" as const, sentAt: new Date() }] : []),
            ...(target.emailEnabled ? [{ channel: "EMAIL" as const, status: "PENDING" as const }] : []),
          ],
        },
      },
      include: { deliveries: true },
    });
    const email = n.deliveries.find((d) => d.channel === "EMAIL");
    if (email) await enqueue("notification-email", { deliveryId: email.id, to: target.email }, { dedupeKey: `ne:${email.id}` });
    return n;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // duplicate: already notified
    throw e;
  }
}

async function recipients(where: Prisma.UserWhereInput): Promise<Target[]> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE", deletedAt: null, ...where },
    select: { id: true, email: true, locale: true, emailVerified: true, notificationPreference: true },
  });
  return users.map((u) => ({
    userId: u.id,
    email: u.email,
    locale: u.locale,
    emailEnabled: (u.notificationPreference?.emailEnabled ?? true) && !!u.emailVerified,
    inAppEnabled: u.notificationPreference?.inAppEnabled ?? true,
  }));
}

/** Notify users whose interests/locations match a newly published event. */
export async function notifyNewMatchingEvent(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { categories: { select: { categoryId: true } }, location: true },
  });
  if (!event || event.publishState !== "PUBLISHED") return 0;
  const catIds = event.categories.map((c) => c.categoryId);
  const isOnline = event.format === "ONLINE";
  const targets = await recipients({
    interests: { some: { categoryId: { in: catIds } } },
    notificationPreference: { is: { newEventAlerts: true } },
  });
  const prefs = await db.notificationPreference.findMany({ where: { userId: { in: targets.map((t) => t.userId) } } });
  let sent = 0;
  for (const target of targets) {
    const p = prefs.find((x) => x.userId === target.userId);
    if (p?.onlineOnly && !isOnline && event.format !== "HYBRID") continue;
    if (p && p.locationSlugs.length && event.location && !isOnline && !p.locationSlugs.includes(event.location.slug)) continue;
    if (await createNotification(target, "NEW_MATCHING_EVENT", event, "once")) sent++;
  }
  return sent;
}

/** Tell people who saved an event that it changed or was cancelled. */
export async function notifySavers(eventId: string, type: "EVENT_UPDATED" | "EVENT_CANCELLED", windowKey: string) {
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return 0;
  const targets = await recipients({ savedEvents: { some: { eventId } } });
  let n = 0;
  for (const t of targets) if (await createNotification(t, type, event, windowKey)) n++;
  return n;
}

/** Periodic scan (run by the worker): deadline reminders (<48h) and starting soon (<24h) for saved events. */
export async function scanReminders(now = new Date()) {
  let created = 0;
  const in48h = new Date(now.getTime() + 48 * 3_600_000);
  const in24h = new Date(now.getTime() + 24 * 3_600_000);

  const closing = await db.event.findMany({
    where: { publishState: "PUBLISHED", deletedAt: null, cancelled: false, registrationClosedOverride: false, registrationDeadline: { gt: now, lte: in48h } },
  });
  for (const ev of closing) {
    const targets = await recipients({
      savedEvents: { some: { eventId: ev.id } },
      notificationPreference: { is: { deadlineReminders: true } },
    });
    for (const t of targets) if (await createNotification(t, "REGISTRATION_CLOSING_SOON", ev, "48h")) created++;
  }

  const starting = await db.event.findMany({
    where: { publishState: "PUBLISHED", deletedAt: null, cancelled: false, startAt: { gt: now, lte: in24h } },
  });
  for (const ev of starting) {
    const targets = await recipients({ savedEvents: { some: { eventId: ev.id } } });
    for (const t of targets) if (await createNotification(t, "EVENT_STARTING_SOON", ev, "24h")) created++;
  }
  return created;
}

export function renderNotificationEmail(
  n: { title: string; body: string; user: { locale: string }; createdAt: Date },
  unsubscribeUrl: string,
) {
  const locale = isLocale(n.user.locale) ? n.user.locale : "en";
  const t = createTranslator(locale);
  return {
    subject: n.title,
    text: `${n.title}\n${formatDateTime(n.createdAt, locale)}\n\n${n.body}\n\n—\n${t("notify.unsubscribe")}: ${unsubscribeUrl}`,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
  };
}
