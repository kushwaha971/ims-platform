import { API_PATHS } from 'src/api/APIPaths';
import { api, publicApi, ubConfig } from 'src/api/AxiosInstances';

import type { PayLink, PublicPayLink } from '../types/payLink.types';

/** Part 19 §19.3.4 — the pay link's two calls, the snake ⇄ camel mapping and nothing else. */

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const modulesOf = (row: Wire): readonly string[] =>
  (((row.qr ?? {}) as Wire).modules ?? []) as readonly string[];

/** The desk's QR for `amount`; quiet, because a missing UPI ID is shown in the dialog. */
export const createPayLink = async (amount: string, reference: string): Promise<PayLink> => {
  const response = await api.post<{ data: Wire }>(
    API_PATHS.PAY_LINKS,
    { amount, reference },
    ubConfig({ suppressErrorSnackbar: true })
  );
  const row = response.data.data;
  return {
    url: s(row.url),
    upiUrl: s(row.upi_url),
    vpa: s(row.vpa),
    amount: s(row.amount),
    note: s(row.note),
    qrModules: modulesOf(row),
  };
};

/** The payer's page, without a session. */
export const getPublicPayLink = async (
  token: string,
  signal?: AbortSignal
): Promise<PublicPayLink> => {
  const response = await publicApi.get<{ data: Wire }>(API_PATHS.PUBLIC_PAY(token), { signal });
  const row = response.data.data;
  return {
    businessName: s(row.business_name),
    upiUrl: s(row.upi_url),
    vpa: s(row.vpa),
    amount: s(row.amount),
    note: s(row.note),
    reference: s(row.reference),
    qrModules: modulesOf(row),
  };
};
