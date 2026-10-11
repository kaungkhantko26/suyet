import type { Metadata } from "next";
import { config } from "@/lib/config";
import { Alert, Container } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };

const SECTIONS = [
  ["What we collect", "If you create an account: your name, email address and password (stored only as a salted hash). Optional profile details you choose to add. Events you save and your notification preferences."],
  ["What we do not collect", "Browsing events needs no account. Analytics are anonymous counts (page views, searches, registration-link clicks). We do not store IP addresses, device identifiers or user accounts in analytics, and we do not use advertising trackers."],
  ["Email", "We email you for account verification, password resets and notifications you opted into. Every notification email includes an unsubscribe link, and you can change preferences in your dashboard."],
  ["Event registrations", "If you register for an event on this website, your name, email address and your answers are shared with that event's organizer, and only for that event. You see exactly what is shared and must agree before submitting. Organizers may not ask for passwords, payment details or government ID numbers. You can withdraw a registration at any time."],
  ["How long we keep data", "Account and profile data is kept until you delete your account. Registration answers are deleted when you delete your account. Security logs (which hold no passwords or tokens and only a keyed hash of network addresses) are kept for a limited period to detect abuse. Final retention periods are to be confirmed before launch."],
  ["Younger users", "Optional profile details are never shown publicly and are not shared with organizers. If you are under 18, please involve a parent or teacher before registering for an event. Additional safeguards for minors are being reviewed."],
  ["Third-party links", `Registration happens on organizers' own websites. Their privacy practices are theirs; ${config.brandName} does not control them.`],
  ["Cookies", "We use one HTTP-only session cookie when you are logged in and a language preference cookie. No third-party cookies."],
  ["Your choices", "You can edit or hide optional profile fields, unsubscribe from emails, and request deletion of your account by contacting us."],
] as const;

export default async function PrivacyPage() {
  const t = await getT();
  return (
    <Container className="max-w-3xl py-14">
      <h1 className="font-serif text-4xl font-medium tracking-tight">{t("pages.privacyTitle")}</h1>
      <Alert tone="warning" className="mt-6">{t("pages.legalNotice")}</Alert>
      <div className="mt-10 space-y-8">
        {SECTIONS.map(([h, b]) => (<section key={h}><h2 className="text-xl font-semibold">{h}</h2><p className="mt-2 leading-relaxed text-muted">{b}</p></section>))}
      </div>
    </Container>
  );
}
