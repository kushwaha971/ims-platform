import * as Yup from 'yup';

import type { TranslateFn } from 'src/hooks/useTranslation';
import type { ValidationSchemas } from 'src/hooks/useValidationSchemas';
import { PAYMENT_MODES, UPI_APPS } from 'src/types/domain.types';

import type { PaymentLineForm } from '../types/payment.types';

/**
 * One mode line of the payment editor — shared with every form that takes money
 * through `PaymentModeEditor` (QA F2: the library's admission), so a line is
 * refused for the same reasons wherever it is typed.
 */
export const buildPaymentLineSchema = (
  v: ValidationSchemas,
  t: TranslateFn
): Yup.ObjectSchema<PaymentLineForm> =>
  Yup.object({
    mode: Yup.mixed<(typeof PAYMENT_MODES)[number] | ''>()
      .oneOf([...PAYMENT_MODES, ''])
      .defined()
      .default('')
      .test('chosen', t('payments.mode.required'), (value) => !!value),
    upiApp: Yup.mixed<(typeof UPI_APPS)[number] | ''>()
      .oneOf([...UPI_APPS, ''])
      .defined()
      .default(''),
    amount: v.amountValidation().defined().default(''),
    reference: v.boundedText(64),
  }) as Yup.ObjectSchema<PaymentLineForm>;
