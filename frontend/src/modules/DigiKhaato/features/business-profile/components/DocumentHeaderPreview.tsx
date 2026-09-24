'use client';

import { memo } from 'react';

import { UbBox, UbCard, UbImagePreview, UbStack, UbText } from 'src/design-system';

/**
 * PLT-07 FR-7 — the supplier block a bill will print, updated as the merchant
 * types: logo, legal name (trade name under it when both exist), address,
 * GSTIN with its state, phone and email (Rule 46's supplier fields, BR-1).
 *
 * FR-7 says the SAME print component SAL-03's A4 template uses. That template
 * does not exist yet (no sales documents), so this is the header block alone;
 * `features/documents-print` should adopt it when SAL-03 lands so the preview
 * and the paper cannot disagree.
 */
export interface DocumentHeaderPreviewProps {
  readonly logoSrc: string | null;
  readonly name: string;
  readonly legalName: string;
  readonly addressLines: readonly string[];
  readonly gstinLine: string | null;
  readonly phone: string;
  readonly email: string;
  readonly labels: {
    readonly title: string;
    readonly placeholderName: string;
    readonly noLogo: string;
    readonly logoAlt: string;
  };
}

function DocumentHeaderPreviewInner({
  logoSrc,
  name,
  legalName,
  addressLines,
  gstinLine,
  phone,
  email,
  labels,
}: Readonly<DocumentHeaderPreviewProps>): React.JSX.Element {
  const primary = legalName || name || labels.placeholderName;
  const secondary = legalName && name && legalName !== name ? name : null;
  const contact = [phone, email].filter(Boolean).join(' · ');
  return (
    <UbCard title={labels.title}>
      <UbBox className="rounded-control border border-border-subtle bg-white p-4">
        <UbStack direction="row" gap={3} align="start">
          <UbImagePreview src={logoSrc} alt={labels.logoAlt} emptyLabel={labels.noLogo} size="sm" />
          <UbStack gap={0.5} className="min-w-0">
            <UbText variant="h4" className="break-words">
              {primary}
            </UbText>
            {secondary && (
              <UbText variant="body-sm" tone="secondary" className="break-words">
                {secondary}
              </UbText>
            )}
            {addressLines.map((line) => (
              <UbText key={line} variant="caption" tone="secondary" className="break-words">
                {line}
              </UbText>
            ))}
            {gstinLine && (
              <UbText variant="caption" tone="secondary" className="font-mono">
                {gstinLine}
              </UbText>
            )}
            {contact && (
              <UbText variant="caption" tone="secondary" className="break-words">
                {contact}
              </UbText>
            )}
          </UbStack>
        </UbStack>
      </UbBox>
    </UbCard>
  );
}

export const DocumentHeaderPreview = memo(DocumentHeaderPreviewInner);
