import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/contact-form";
import { Container } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const t = await getT();
  return (
    <Container className="max-w-xl py-14">
      <h1 className="font-serif text-4xl font-medium tracking-tight">{t("pages.contactTitle")}</h1>
      <p className="mt-3 text-muted">{t("pages.contactBody")}</p>
      <div className="mt-8"><ContactForm /></div>
    </Container>
  );
}
