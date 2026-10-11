import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { Container } from "@/components/ui/misc";
import { ResendVerification } from "./resend-verification";

export async function VerifyBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerified) return null;
  const t = await getT();
  return (
    <div className="border-b border-border bg-warning-bg text-warning">
      <Container className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
        <span>{t("auth.verifyBanner")}</span>
        <ResendVerification label={t("auth.resend")} okLabel={t("auth.resent")} />
      </Container>
    </div>
  );
}
