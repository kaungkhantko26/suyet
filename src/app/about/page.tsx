import type { Metadata } from "next";
import { Container } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default async function AboutPage() {
  const t = await getT();
  const block = (h: string, b: string) => (<section className="border-t border-border pt-8"><h2 className="font-serif text-2xl font-medium">{h}</h2><p className="mt-3 text-muted leading-relaxed">{b}</p></section>);
  return (
    <Container className="max-w-3xl py-14">
      <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">{t("pages.aboutTitle")}</h1>
      <p className="mt-5 text-lg leading-relaxed">{t("pages.aboutLead")}</p>
      <div className="mt-12 space-y-10">
        {block(t("pages.aboutMission"), t("pages.aboutMissionBody"))}
        {block(t("pages.aboutHow"), t("pages.aboutHowBody"))}
        {block(t("pages.aboutScope"), t("pages.aboutScopeBody"))}
        {block(t("pages.aboutWho"), t("pages.aboutWhoBody"))}
      </div>
    </Container>
  );
}
