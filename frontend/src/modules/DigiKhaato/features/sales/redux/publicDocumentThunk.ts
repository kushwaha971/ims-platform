import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { PublicDocument, PublicDocumentFailure } from '../types/publicDocument.types';

type Reject = { rejectValue: PublicDocumentFailure };

/**
 * One failure word per thing the customer can DO about it. A 404 is the same
 * word whatever caused it (unknown, expired, revoked — §19 forbids the page
 * saying which); a 429 asks them to wait; everything else offers a retry.
 */
export const publicFailureOf = (error: ApiErrorShape): PublicDocumentFailure => {
  if (error.status === 404 || error.code === 'not_found') return 'unavailable';
  if (error.status === 429 || error.code === 'rate_limited') return 'rate_limited';
  return 'failed';
};

/** QUERY. `GET /public/d/{token}` — no session, no toast (SAL-03 FR-5). */
export const fetchPublicDocument = createAsyncThunk<PublicDocument, string, Reject>(
  'publicDocument/fetch',
  async (token, { signal, rejectWithValue }) => {
    try {
      const { getPublicDocument } = await import('../api/publicDocumentService');
      return await getPublicDocument(token, signal);
    } catch (error) {
      return rejectWithValue(publicFailureOf(toApiError(error)));
    }
  }
);
