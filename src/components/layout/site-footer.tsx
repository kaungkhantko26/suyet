import { getT } from "@/i18n/server";
import { Container } from "@/components/ui/misc";
import { FooterNavLink } from "./footer-nav-link";
import { Wordmark } from "./logo";

export async function SiteFooter() {
  const t = await getT();
  const col = "mb-3 text-xs font-semibold tracking-wide text-muted uppercase";
  const link = "flex min-h-9 items-center text-sm hover:underline";
  return (
    <footer className="mt-16 border-t border-border bg-surface sm:mt-24">
      {/* Full link columns: desktop/tablet only. On phones, the bottom nav + Profile sheet already
          cover these destinations, so repeating them here would just make the page long. */}
      <Container className="hidden gap-10 py-14 md:grid md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-sm font-medium">{t("brand.tagline")}</p>
          <p className="mt-3 text-sm text-muted">{t("footer.rights")}</p>
          <p className="mt-3 text-xs text-muted">{t("brand.credit")}</p>
        </div>
        <nav aria-label={t("footer.explore")}>
          <h2 className={col}>{t("footer.explore")}</h2>
          <FooterNavLink href="/events" className={link}>{t("nav.explore")}</FooterNavLink>
          <FooterNavLink href="/hackathons" className={link}>{t("nav.hackathons")}</FooterNavLink>
          <FooterNavLink href="/categories/technology-workshops" className={link}>{t("footer.workshops")}</FooterNavLink>
          <FooterNavLink href="/calendar" className={link}>{t("nav.calendar")}</FooterNavLink>
          <FooterNavLink href="/submit-event" className={link}>{t("nav.submit")}</FooterNavLink>
        </nav>
        <nav aria-label={t("footer.community")}>
          <h2 className={col}>{t("footer.community")}</h2>
          <FooterNavLink href="/organizers" className={link}>{t("nav.organizers")}</FooterNavLink>
        </nav>
        <nav aria-label={t("footer.legal")}>
          <h2 className={col}>{t("footer.legal")}</h2>
          <FooterNavLink href="/about" className={link}>{t("footer.about")}</FooterNavLink>
          <FooterNavLink href="/contact" className={link}>{t("footer.contact")}</FooterNavLink>
          <FooterNavLink href="/privacy" className={link}>{t("footer.privacy")}</FooterNavLink>
          <FooterNavLink href="/terms" className={link}>{t("footer.terms")}</FooterNavLink>
        </nav>
      </Container>

      {/* Condensed version: phones only. */}
      <Container className="py-8 md:hidden">
        <Wordmark />
        <p className="mt-3 text-xs text-muted">{t("brand.credit")}</p>
        <nav aria-label={t("footer.legal")} className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <FooterNavLink href="/about" className="hover:underline">{t("footer.about")}</FooterNavLink>
          <FooterNavLink href="/contact" className="hover:underline">{t("footer.contact")}</FooterNavLink>
          <FooterNavLink href="/privacy" className="hover:underline">{t("footer.privacy")}</FooterNavLink>
          <FooterNavLink href="/terms" className="hover:underline">{t("footer.terms")}</FooterNavLink>
        </nav>
      </Container>

      <div className="border-t border-border">
        <Container className="flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-muted">
          <span>© {new Date().getFullYear()} {t("brand.name")} · {t("brand.parentTagline")}</span>
          <span>{t("common.mmt")} · UTC+06:30</span>
        </Container>
      </div>
    </footer>
  );
}
