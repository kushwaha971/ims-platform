'use client';

import { memo } from 'react';

import { UbBox, UbCard, UbDivider, UbImagePreview, UbStack, UbText } from 'src/design-system';
import { HEX_COLOUR } from 'src/utils/theme';

/**
 * WLB-01 FR-10 — the app header and a bill header, drawn with the UNSAVED
 * values, so the merchant sees the result before committing it.
 *
 * The brand colour is applied to the bar, the rule and the sample button
 * only — never to amounts (FR-8: "primary for rules/headings only; amounts
 * keep ledger semantics"), which is why there is no amount in this preview.
 */
export interface BrandingPreviewProps {
  readonly primaryHex: string;
  readonly appName: string;
  readonly businessName: string;
  readonly docHeader: string;
  readonly docFooter: string;
  readonly legalFooter: string;
  readonly logoSrc: string | null;
  readonly labels: {
    readonly title: string;
    readonly appHeader: string;
    readonly billHeader: string;
    readonly sampleButton: string;
    readonly noLogo: string;
    readonly logoAlt: string;
  };
}

function BrandingPreviewInner({
  primaryHex,
  appName,
  businessName,
  docHeader,
  docFooter,
  legalFooter,
  logoSrc,
  labels,
}: Readonly<BrandingPreviewProps>): React.JSX.Element {
  const colour = HEX_COLOUR.test(primaryHex) ? primaryHex : '#4A47D6';
  return (
    <UbCard title={labels.title}>
      <UbStack gap={4}>
        <UbStack gap={1}>
          <UbText variant="caption" tone="tertiary">
            {labels.appHeader}
          </UbText>
          <UbBox className="flex items-center gap-3 rounded-control border border-border-subtle p-3">
            <UbImagePreview
              src={logoSrc}
              alt={labels.logoAlt}
              emptyLabel={labels.noLogo}
              size="sm"
            />
            <UbText variant="body-medium" className="min-w-0 flex-1 truncate">
              {appName}
            </UbText>
            <UbBox
              className="ds-body-s-medium rounded-control px-3 py-1.5 text-white"
              style={{ backgroundColor: colour }}
            >
              {labels.sampleButton}
            </UbBox>
          </UbBox>
        </UbStack>
        <UbStack gap={1}>
          <UbText variant="caption" tone="tertiary">
            {labels.billHeader}
          </UbText>
          <UbBox className="rounded-control border border-border-subtle bg-white p-4">
            <UbStack gap={2}>
              <UbStack direction="row" gap={3} align="center">
                <UbImagePreview
                  src={logoSrc}
                  alt={labels.logoAlt}
                  emptyLabel={labels.noLogo}
                  size="sm"
                />
                <UbStack gap={0.5} className="min-w-0">
                  <UbText variant="h4" className="break-words" style={{ color: colour }}>
                    {businessName}
                  </UbText>
                  {docHeader && (
                    <UbText variant="caption" tone="secondary" className="break-words">
                      {docHeader}
                    </UbText>
                  )}
                </UbStack>
              </UbStack>
              <UbBox className="h-0.5 w-full" style={{ backgroundColor: colour }} />
              {(docFooter || legalFooter) && (
                <>
                  <UbDivider decorative />
                  {docFooter && (
                    <UbText
                      variant="caption"
                      tone="secondary"
                      className="whitespace-pre-wrap break-words"
                    >
                      {docFooter}
                    </UbText>
                  )}
                  {legalFooter && (
                    <UbText variant="caption" tone="tertiary" className="break-words">
                      {legalFooter}
                    </UbText>
                  )}
                </>
              )}
            </UbStack>
          </UbBox>
        </UbStack>
      </UbStack>
    </UbCard>
  );
}

export const BrandingPreview = memo(BrandingPreviewInner);
