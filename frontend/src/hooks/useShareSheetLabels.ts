'use client';

import { useMemo } from 'react';

import type { UbShareSheetLabels } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import 'src/i18n/catalogues/share';

/**
 * `UbShareSheet`'s words, written once (WP-03 / WP-04). The khata reminder, the
 * source reminder, the payment receipt and the invoice share each built the
 * same seven labels by hand; a label added to the sheet — the composer's
 * "Reset" and its empty-message line — would otherwise be four edits that one
 * caller misses. `withCall` adds the dial row's word for the sheets that dial.
 */
export const useShareSheetLabels = (withCall = false): UbShareSheetLabels => {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      whatsapp: t('share.whatsapp'),
      sms: t('share.sms'),
      copy: t('share.copyText'),
      more: t('share.more'),
      close: t('common.action.close'),
      preview: t('share.preview'),
      reset: t('share.reset'),
      empty: t('share.empty'),
      ...(withCall ? { call: t('reminders.sheet.call') } : {}),
    }),
    [t, withCall]
  );
};
