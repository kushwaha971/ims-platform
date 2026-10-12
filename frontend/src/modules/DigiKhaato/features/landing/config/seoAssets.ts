/** Public brand assets shared without loading module-specific landing copy. */
export const OG_IMAGE = {
  url: '/brand/yourkhata-og.png',
  width: 1200,
  height: 630,
  alt: 'YourKhata — All your records, in one place.',
  type: 'image/png',
} as const;

/** The mark as a square raster, for `Organization.logo` (Google asks for ≥ 112 px). */
export const LOGO_IMAGE = { url: '/icons/icon-512.png', width: 512, height: 512 } as const;
