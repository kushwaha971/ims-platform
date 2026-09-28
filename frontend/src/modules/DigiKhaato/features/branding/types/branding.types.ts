/** WLB-01 FR-1/FR-2 — the resolved branding, with where each value came from. */
export type BrandingSource = 'tenant' | 'partner' | 'default';

export type BrandingTextKey =
  'primary_hex' | 'secondary_hex' | 'app_name' | 'doc_header' | 'doc_footer';

/** What a partner may lock (WLB-02 §10); `logo` stands for the logo file. */
export type LockableKey = 'primary_hex' | 'secondary_hex' | 'app_name' | 'doc_footer' | 'logo';

export interface Branding {
  readonly primaryHex: string;
  readonly secondaryHex: string | null;
  readonly appName: string;
  readonly docHeader: string;
  readonly docFooter: string;
  readonly logoUrl: string | null;
  readonly signatureUrl: string | null;
  readonly legalFooter: string;
  readonly partnerName: string;
  readonly sources: Readonly<Record<BrandingTextKey | 'logo', BrandingSource>>;
  readonly lockedKeys: readonly LockableKey[];
}

export interface BrandingApi {
  readonly primary_hex: string;
  readonly secondary_hex: string | null;
  readonly app_name: string;
  readonly doc_header: string | null;
  readonly doc_footer: string | null;
  readonly logo_url: string | null;
  readonly signature_url: string | null;
  readonly legal_footer: string;
  readonly partner_name: string;
  readonly sources: Readonly<Record<string, string>>;
  readonly locked_keys: readonly string[];
}

/** One PUT's worth of changes; absent keys are left as they are. */
export interface BrandingChanges {
  readonly primaryHex?: string;
  readonly appName?: string;
  readonly docHeader?: string;
  readonly docFooter?: string;
  readonly logo?: File;
  readonly signature?: File;
  readonly removeLogo?: boolean;
  readonly removeSignature?: boolean;
  readonly reset?: readonly (BrandingTextKey | 'logo')[];
}
