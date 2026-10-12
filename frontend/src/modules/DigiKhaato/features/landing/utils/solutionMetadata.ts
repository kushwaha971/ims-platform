import { absoluteUrl } from 'src/utils/seo';

import { OG_IMAGE } from '../config/seoAssets';

import type { Metadata } from 'next';
export function solutionMetadata(path: string, title: string, description: string): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: absoluteUrl(path) },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: absoluteUrl(path),
      siteName: 'YourKhata',
      title,
      description,
      locale: 'en_IN',
      images: [{ ...OG_IMAGE }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  };
}
