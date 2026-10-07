import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { PayLink } from '../types/payLink.types';

/**
 * Shop P0 — the pay link's calls. The service is imported INSIDE each thunk (the
 * invalidation registry imports every thunk module; a top-level import would ship
 * the service to every route).
 */
const service = () => import('../api/payLinkService');

/** QUERY. The desk's "UPI QR": draws the business's own UPI ID; it moves nothing. */
export const createPayLink = createAsyncThunk<
  PayLink,
  { readonly amount: string; readonly reference: string },
  { rejectValue: ApiErrorShape }
>('payLink/createPayLink', async ({ amount, reference }, { rejectWithValue }) => {
  try {
    return await (await service()).createPayLink(amount, reference);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'payLink.error'));
  }
});
