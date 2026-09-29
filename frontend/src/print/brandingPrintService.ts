/**
 * R33 / A16 — the tenant's letterhead for every printed customer document.
 *
 * Moved here from `features/sales` because sales stopped being the only thing
 * that prints: payments' receipt already read it through a sales import, and
 * library cards, gym receipts and lending schedules are next. A shared print
 * primitive living inside one feature is how every module ends up importing
 * Shop & billing, which A11's boundary zones now refuse.
 *
 * The branding feature owns the endpoint and its wire shape; this is the six
 * fields a print sheet uses, read through that feature's service (imported
 * inside the call, so no route pays for it until something prints).
 */
export interface PrintBranding {
  readonly logoUrl: string | null;
  readonly signatureUrl: string | null;
  readonly docHeader: string;
  readonly docFooter: string;
  readonly appName: string;
  readonly primaryHex: string | null;
}

/** T1's `GET /tenants/current/branding`, trimmed to what a letterhead prints. */
export const getPrintBranding = async (signal?: AbortSignal): Promise<PrintBranding> => {
  const { fetchBranding } =
    await import('modules/DigiKhaato/features/branding/api/brandingService');
  const branding = await fetchBranding(signal);
  return {
    logoUrl: branding.logoUrl,
    signatureUrl: branding.signatureUrl,
    docHeader: branding.docHeader,
    docFooter: branding.docFooter,
    appName: branding.appName,
    primaryHex: branding.primaryHex,
  };
};
