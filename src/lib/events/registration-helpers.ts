/** The link used for status/availability logic: external URL, or the on-site apply page when the form is enabled. */
export function effectiveRegistrationUrl(e: { slug: string; registrationMode?: "EXTERNAL" | "ON_PLATFORM"; registrationUrl: string | null; registrationForm?: { enabled: boolean } | null }): string | null {
  if (e.registrationMode === "ON_PLATFORM") return e.registrationForm?.enabled ? `/events/${e.slug}/apply` : null;
  return e.registrationUrl;
}
