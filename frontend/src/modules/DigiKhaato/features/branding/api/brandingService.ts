import { API_PATHS } from 'src/api/APIPaths';
import { absoluteFileUrl } from 'src/api/apiUrl';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type {
  Branding,
  BrandingApi,
  BrandingChanges,
  BrandingSource,
  BrandingTextKey,
  LockableKey,
} from '../types/branding.types';

/**
 * Part 19 §19.3.4 — WLB-01's service (`fetchBranding`, `saveBranding`), also
 * PLT-07's signature upload (`uploadBrandingFiles`), because the server has
 * one branding endpoint for both. No React, no Redux.
 */

const SOURCES: readonly BrandingSource[] = ['tenant', 'partner', 'default'];
const LOCKABLE: readonly LockableKey[] = [
  'primary_hex',
  'secondary_hex',
  'app_name',
  'doc_footer',
  'logo',
];

const source = (raw: string | undefined): BrandingSource =>
  raw && (SOURCES as readonly string[]).includes(raw) ? (raw as BrandingSource) : 'default';

export const toBranding = (data: BrandingApi): Branding => ({
  primaryHex: data.primary_hex,
  secondaryHex: data.secondary_hex,
  appName: data.app_name,
  docHeader: data.doc_header ?? '',
  docFooter: data.doc_footer ?? '',
  // Made absolute here, once, so every consumer can put it straight in a src.
  logoUrl: data.logo_url ? absoluteFileUrl(data.logo_url) : null,
  signatureUrl: data.signature_url ? absoluteFileUrl(data.signature_url) : null,
  legalFooter: data.legal_footer ?? '',
  partnerName: data.partner_name,
  sources: {
    primary_hex: source(data.sources.primary_hex),
    secondary_hex: source(data.sources.secondary_hex),
    app_name: source(data.sources.app_name),
    doc_header: source(data.sources.doc_header),
    doc_footer: source(data.sources.doc_footer),
    logo: source(data.sources.logo_attachment_id),
  },
  lockedKeys: data.locked_keys.filter((key): key is LockableKey =>
    (LOCKABLE as readonly string[]).includes(key)
  ),
});

/**
 * GET /tenants/current/branding.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page read that renders its
 * own failure, so the toast is suppressed.
 */
export const fetchBranding = async (signal?: AbortSignal): Promise<Branding> => {
  const response = await api.get<{ data: BrandingApi }>(
    API_PATHS.TENANT_BRANDING,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toBranding(response.data.data);
};

const FIELD: Readonly<
  Record<'primaryHex' | 'appName' | 'docHeader' | 'docFooter', BrandingTextKey>
> = {
  primaryHex: 'primary_hex',
  appName: 'app_name',
  docHeader: 'doc_header',
  docFooter: 'doc_footer',
};

/** The multipart body for one PUT (FR-1). Exported for its test. */
export const toFormData = (changes: BrandingChanges): FormData => {
  const body = new FormData();
  (Object.keys(FIELD) as (keyof typeof FIELD)[]).forEach((key) => {
    const value = changes[key];
    if (value !== undefined) body.append(FIELD[key], value);
  });
  if (changes.logo) body.append('logo', changes.logo);
  if (changes.signature) body.append('signature', changes.signature);
  if (changes.removeLogo) body.append('remove_logo', 'true');
  if (changes.removeSignature) body.append('remove_signature', 'true');
  if (changes.reset?.length) body.append('reset', changes.reset.join(','));
  return body;
};

/**
 * PUT /tenants/current/branding — multipart (FR-1). A colour under 3:1 is 400
 * `low_contrast` with `details.suggested_hex`; a locked key 403
 * `branding_locked`; a bad image `unsupported_file_type` / `file_too_large`.
 * `Content-Type` is left to the browser, which adds the multipart boundary.
 */
export const saveBranding = async (changes: BrandingChanges): Promise<Branding> => {
  const response = await api.put<{ data: BrandingApi }>(
    API_PATHS.TENANT_BRANDING,
    toFormData(changes),
    ubConfig({ headers: { 'Content-Type': 'multipart/form-data' } })
  );
  return toBranding(response.data.data);
};
