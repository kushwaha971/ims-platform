import { UbStatusBadge } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { COPY_STATUS_TONE } from '../view-model/copyDisplay';

import type { CopyStatus } from '../types/catalogue.types';

/** F03 (LIB-02 §8) — a copy's status, in the tone `copyDisplay` gives it. */
export function CopyStatusBadge({
  status,
  t,
}: Readonly<{ status: CopyStatus; t: TranslateFn }>): React.JSX.Element {
  return (
    <UbStatusBadge tone={COPY_STATUS_TONE[status]} label={t(`library.copy.status.${status}`)} />
  );
}
