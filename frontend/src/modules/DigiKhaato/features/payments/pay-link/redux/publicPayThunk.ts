import { createAsyncThunk } from '@reduxjs/toolkit';

import { toApiError } from 'src/utils/apiError';

import type { PublicPayFailure, PublicPayLink } from '../types/payLink.types';

/** Its own module so the payer's page loads none of the desk's words (`payLink.*`). */
const service = () => import('../api/payLinkService');

/** QUERY. `GET /public/pay/{token}` — no session, no toast; one word per thing to do. */
export const fetchPublicPayLink = createAsyncThunk<
  PublicPayLink,
  string,
  { rejectValue: PublicPayFailure }
>('payLink/fetchPublicPayLink', async (token, { signal, rejectWithValue }) => {
  try {
    return await (await service()).getPublicPayLink(token, signal);
  } catch (error) {
    const shaped = toApiError(error);
    if (shaped.status === 404) return rejectWithValue('unavailable');
    if (shaped.status === 429) return rejectWithValue('rate_limited');
    return rejectWithValue('failed');
  }
});
