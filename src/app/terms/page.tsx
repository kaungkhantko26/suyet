import type { Metadata } from "next";
import { config } from "@/lib/config";
import { Alert, Container } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Terms of Service", alternates: { canonical: "/terms" } };

const SECTIONS = [
  ["Discovery only", `${config.brandName} lists technology events and links to the organizers' official pages. We do not sell tickets or process registrations or payments.`],
  ["Accuracy", "Listings are provided by organizers and reviewed by our team, but details can change. Always confirm on the official source before you register or travel. A Verified badge means a reviewer checked the official source on the date shown, nothing more."],
  ["Not an endorsement", "Listing an event does not mean we organize, sponsor or endorse it, unless the listing says so."],
  ["Organizer submissions", "Organizers must submit accurate information and only for events they are authorised to represent. We may edit, reject, unpublish or remove listings, and suspend accounts that submit misleading or unsafe content."],
  ["Acceptable use", "Do not attempt to disrupt the service, scrape it aggressively, or submit false reports."],
  ["Changes", "We may update these terms; continued use means you accept the updated terms."],
] as const;

export default async function TermsPage() {
  const t = await getT();
  return (
    <Container className="max-w-3xl py-14">
      <h1 className="font-serif text-4xl font-medium tracking-tight">{t("pages.termsTitle")}</h1>
      <Alert tone="warning" className="mt-6">{t("pages.legalNotice")}</Alert>
      <div className="mt-10 space-y-8">
        {SECTIONS.map(([h, b]) => (<section key={h}><h2 className="text-xl font-semibold">{h}</h2><p className="mt-2 leading-relaxed text-muted">{b}</p></section>))}
      </div>
    </Container>
  );
}
