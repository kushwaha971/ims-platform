'use client';

import { UbInfoRow, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { GstSection } from './GstSection';
import { ReportAmount } from './ReportAmount';

import type { Gstr3b } from '../types/taxReports.types';

/**
 * RPT-07 FR-8 — the GSTR-3B boxes top to bottom, each figure beside its
 * coordinate so it can be typed into the portal. A box the product does not
 * model (3.1(b) exports, 4(B) reversals) says so rather than showing a zero
 * that looks measured (BR-9).
 */
export function Gstr3bBoxes({ gstr3b }: Readonly<{ gstr3b: Gstr3b }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbStack gap={4}>
      {gstr3b.boxes.map(({ box, figures }) => (
        <GstSection
          key={box}
          title={t(`reports.gst.box.${box}`)}
          coordinate={`GSTR-3B · ${box}`}
          hint={figures.note === 'not_modelled' ? t('reports.gst.box.notModelled') : undefined}
        >
          {figures.note !== 'not_modelled' && (
            <>
              <UbInfoRow
                label={t('reports.gst.column.taxable')}
                value={<ReportAmount value={figures.taxable} />}
              />
              <UbInfoRow label="IGST" value={<ReportAmount value={figures.igst} />} />
              <UbInfoRow label="CGST" value={<ReportAmount value={figures.cgst} />} />
              <UbInfoRow label="SGST" value={<ReportAmount value={figures.sgst} />} />
              <UbInfoRow
                label={t('reports.gst.column.cess')}
                value={<ReportAmount value={figures.cess} />}
              />
            </>
          )}
        </GstSection>
      ))}
      <GstSection title={t('reports.gst.box.3.2')} coordinate="GSTR-3B · 3.2">
        {gstr3b.stateWise.length === 0 ? (
          <UbText variant="body-sm" tone="tertiary">
            {t('reports.gst.section.empty')}
          </UbText>
        ) : (
          gstr3b.stateWise.map((row) => (
            <UbInfoRow
              key={row.posState}
              label={t('reports.gst.box.stateRow', { state: row.posState })}
              value={
                <UbStack gap={0} className="items-end">
                  <ReportAmount value={row.taxable} />
                  <UbText as="span" variant="caption" tone="tertiary">
                    {t('reports.gst.box.igstOf', { amount: formatInr(row.igst) })}
                  </UbText>
                </UbStack>
              }
            />
          ))
        )}
      </GstSection>
      <GstSection title={t('reports.gst.box.5')} coordinate="GSTR-3B · 5">
        <UbInfoRow
          label={t('reports.gst.inter')}
          value={<ReportAmount value={gstr3b.exemptInward.inter} />}
        />
        <UbInfoRow
          label={t('reports.gst.intra')}
          value={<ReportAmount value={gstr3b.exemptInward.intra} />}
        />
      </GstSection>
      <GstSection
        title={t('reports.gst.net.title')}
        coordinate={t('reports.gst.net.coordinate')}
        hint={t('reports.gst.net.hint')}
      >
        <UbInfoRow
          label={t('reports.gst.net.output')}
          value={<ReportAmount value={gstr3b.net.outputTax} />}
        />
        <UbInfoRow
          label={t('reports.gst.net.itc')}
          value={<ReportAmount value={gstr3b.net.itc} />}
        />
        <UbInfoRow label="IGST" value={<ReportAmount value={gstr3b.net.igst} />} />
        <UbInfoRow label="CGST" value={<ReportAmount value={gstr3b.net.cgst} />} />
        <UbInfoRow label="SGST" value={<ReportAmount value={gstr3b.net.sgst} />} />
        <UbInfoRow
          label={t('reports.gst.column.cess')}
          value={<ReportAmount value={gstr3b.net.cess} />}
        />
        <UbInfoRow
          variant="total"
          label={t('reports.gst.net.total')}
          value={<ReportAmount value={gstr3b.net.total} size="md" />}
        />
      </GstSection>
    </UbStack>
  );
}
