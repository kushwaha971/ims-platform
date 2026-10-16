'use client';

import { UbShareSheet } from 'src/design-system';
import { useShareFeedback } from 'src/hooks/useShareFeedback';
import { useShareSheetLabels } from 'src/hooks/useShareSheetLabels';
import { formatPhoneForDisplay } from 'src/utils/share';

/**
 * MSG-01/02 (WP-04) — a sales document shared to the customer goes through the
 * shared composer: the default words with the live link, editable, and the
 * recipient visible before WhatsApp opens. Loaded with `dynamic()` from the
 * detail page, so the composer's bytes come only when somebody shares.
 */
export function InvoiceShareSheet({
  title,
  party,
  message,
  phone,
  onClose,
}: Readonly<{
  title: string;
  party: string;
  message: string;
  phone: string | null;
  onClose: () => void;
}>): React.JSX.Element {
  const labels = useShareSheetLabels();
  const feedback = useShareFeedback();
  const number = formatPhoneForDisplay(phone);
  return (
    <UbShareSheet
      open
      onOpenChange={(next) => !next && onClose()}
      title={title}
      description={number ? `${party} · ${number}` : party}
      message={message}
      phone={phone}
      labels={labels}
      onShared={feedback.onShared}
      onFailed={feedback.onFailed}
    />
  );
}
