import { config } from "../config";
import { db } from "../db";
import { sendMail } from "../email";
import { enqueue } from "../jobs";
import { notifyNewMatchingEvent, notifySavers, renderNotificationEmail, scanReminders } from "../services/notifications";
import { raiseAlert, scanSecurityEvents } from "../services/alerts";
import { checkSources } from "./sources";

type Payload = Record<string, unknown>;

export const handlers: Record<string, (p: Payload) => Promise<unknown>> = {
  email: async (p) => sendMail({ to: String(p.to), subject: String(p.subject), text: String(p.text) }),

  "notification-email": async (p) => {
    const d = await db.notificationDelivery.findUnique({
      where: { id: String(p.deliveryId) },
      include: { notification: { include: { user: { include: { notificationPreference: true } } } } },
    });
    if (!d || d.status === "SENT") return;
    const n = d.notification;
    if (!n.user.notificationPreference?.emailEnabled) {
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "SKIPPED" } });
      return;
    }
    const unsubscribe = `${config.appUrl}/unsubscribe?token=${n.user.notificationPreference.unsubscribeToken}`;
    try {
      await db.notificationDelivery.update({ where: { id: d.id }, data: { attempts: { increment: 1 } } });
      await sendMail({ to: String(p.to), ...renderNotificationEmail({ ...n, user: n.user }, unsubscribe) });
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    } catch (e) {
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "FAILED", error: String(e).slice(0, 300) } });
      throw e; // let the job retry with backoff
    }
  },

  "notify-new-event": async (p) => notifyNewMatchingEvent(String(p.eventId)),
  "notify-savers": async (p) => notifySavers(String(p.eventId), p.type as "EVENT_UPDATED" | "EVENT_CANCELLED", String(p.window ?? "x")),
  "scan-reminders": async () => scanReminders(),
  "security-alert": async (p) => raiseAlert(String(p.kind), p.severity as "HIGH" | "CRITICAL", `${String(p.kind)} (${String(p.severity)})`),
  "security-scan": async () => scanSecurityEvents(),
  "check-sources": async () => checkSources(),
  cleanup: async () => {
    const now = new Date();
    await Promise.all([
      db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
      db.verificationToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } }),
      db.job.deleteMany({ where: { status: "DONE", updatedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } }),
    ]);
  },
};

/** Enqueue recurring jobs. Deduplicated per time bucket, so calling this from several places is safe. */
export async function scheduleRecurring(now = new Date()) {
  const bucket = (ms: number) => Math.floor(now.getTime() / ms);
  await Promise.all([
    enqueue("scan-reminders", {}, { dedupeKey: `scan:${bucket(15 * 60_000)}` }),
    enqueue("check-sources", {}, { dedupeKey: `sources:${bucket(6 * 3_600_000)}` }),
    enqueue("cleanup", {}, { dedupeKey: `cleanup:${bucket(86_400_000)}` }),
    enqueue("security-scan", {}, { dedupeKey: `secscan:${bucket(5 * 60_000)}` }),
  ]);
}
