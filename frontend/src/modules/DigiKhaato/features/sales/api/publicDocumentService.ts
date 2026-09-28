import { API_PATHS } from 'src/api/APIPaths';
import { absoluteFileUrl } from 'src/api/apiUrl';
import { publicApi } from 'src/api/AxiosInstances';
import { APP_NAME } from 'src/constants';

import { toDocument } from './salesService';

import type { PublicDocument } from '../types/publicDocument.types';
import type { UpiIntent } from '../types/sales.types';

/**
 * SAL-03 FR-5 — `GET /public/d/{token}` through `publicApi`: no credentials,
 * no auth interceptor, no refresh, no snackbar (the page renders its own
 * failure states — the customer has no app shell to show a toast in).
 *
 * The allow-listed payload is mapped through the merchant's own `toDocument`,
 * so the print sheet receives the shape it always renders. What the payload
 * leaves out by design (ids, version, created-by) maps to empty values here,
 * and the credit note's "Against INV/… dated …" is put back where the print
 * sheet reads it (`links.against`).
 */

type Wire = Record<string, unknown>;

const str = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

export const toPublicDocument = (raw: Wire): PublicDocument => {
  const branding = (raw.tenant_branding ?? {}) as Wire;
  const upi = raw.upi as Wire | null | undefined;
  const logo = str(branding.logo_url);
  return {
    document: toDocument({
      ...raw,
      version: 0,
      links: raw.against ? { against: raw.against } : {},
    }),
    branding: {
      logoUrl: logo ? absoluteFileUrl(logo) : null,
      // A signature image on an open URL is a forgery kit; the customer's copy
      // prints the "Authorised signatory" line without it.
      signatureUrl: null,
      docHeader: str(branding.doc_header) ?? '',
      docFooter: str(branding.doc_footer) ?? '',
      appName: str(branding.app_name) ?? APP_NAME,
      primaryHex: str(branding.primary_hex),
    },
    locale: raw.locale === 'hi' ? 'hi' : 'en',
    upi:
      upi && typeof upi === 'object' && str(upi.upi_url)
        ? {
            upiUrl: String(upi.upi_url),
            amount: str(upi.amount),
            qr: upi.qr as UpiIntent['qr'],
          }
        : null,
  };
};

export const getPublicDocument = async (
  token: string,
  signal?: AbortSignal
): Promise<PublicDocument> => {
  const response = await publicApi.get<{ data: Wire }>(API_PATHS.PUBLIC_DOCUMENT(token), {
    signal,
  });
  return toPublicDocument(response.data.data);
};
