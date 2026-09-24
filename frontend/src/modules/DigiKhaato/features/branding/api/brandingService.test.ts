import { toBranding, toFormData } from './brandingService';

import type { BrandingApi } from '../types/branding.types';

const API_ROW: BrandingApi = {
  primary_hex: '#1F7A4D',
  secondary_hex: null,
  app_name: 'Ramesh Khata',
  doc_header: null,
  doc_footer: 'Thank you',
  logo_url: '/api/v1/files/a1',
  signature_url: null,
  legal_footer: '',
  sources: { primary_hex: 'tenant', app_name: 'partner', logo_attachment_id: 'bogus' },
  locked_keys: ['doc_footer', 'not_a_key'],
  partner_name: 'Metis',
};

/** WLB-01 — the branding service's two translations, wire ↔ app. */
describe('brandingService', () => {
  it('sends only the fields that changed, under the server names', () => {
    // A field sent unchanged would flip its source to "tenant" and detach the
    // shop from its partner's default — FR-6's inheritance lost on every save.
    const body = toFormData({ primaryHex: '#1F7A4D' });
    expect(Array.from(body.keys())).toEqual(['primary_hex']);
    expect(body.get('primary_hex')).toBe('#1F7A4D');
  });

  it('sends a reset as one comma list, and removals as explicit flags', () => {
    // The view reads `reset` as a comma list; repeated keys would keep only one.
    const body = toFormData({ reset: ['app_name', 'logo'], removeSignature: true });
    expect(body.get('reset')).toBe('app_name,logo');
    expect(body.get('remove_signature')).toBe('true');
    expect(body.has('remove_logo')).toBe(false);
  });

  it('attaches image files under their field names', () => {
    const logo = new File([new Uint8Array([0x89, 0x50])], 'logo.png', { type: 'image/png' });
    const body = toFormData({ logo });
    expect(body.get('logo')).toBeInstanceOf(File);
  });

  it('treats an unknown source as the default and drops unknown locked keys', () => {
    // A key the client does not know must not disable a field it cannot name,
    // and an unknown source must never render as "the shop's own".
    const branding = toBranding(API_ROW);
    expect(branding.sources.logo).toBe('default');
    expect(branding.sources.app_name).toBe('partner');
    expect(branding.lockedKeys).toEqual(['doc_footer']);
    expect(branding.docHeader).toBe('');
  });
});
