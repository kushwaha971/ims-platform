import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { PaymentPage } from 'modules/DigiKhaato/features/payments/types/payment.types';

/** UX16: read actual fee receipts, scoped to this student and the Library book. */
export const fetchMemberPayments = createAsyncThunk<
  PaymentPage,
  { membershipId: string; partyId: string; page: number },
  { rejectValue: ApiErrorShape }
>('libraryMemberPayments/fetch', async ({ partyId, page }, { signal, rejectWithValue }) => {
  try {
    const service = await import('modules/DigiKhaato/features/payments/api/paymentService');
    return await service.listPayments(
      {
        partyId,
        bucket: 'library',
        preset: 'all',
        dateFrom: '',
        dateTo: '',
        tab: 'all',
        mode: null,
        q: '',
        page,
      },
      signal
    );
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payments.list.error.title'));
  }
});
