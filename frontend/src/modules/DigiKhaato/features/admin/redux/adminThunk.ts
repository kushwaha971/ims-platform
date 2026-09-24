import { createAsyncThunk } from '@reduxjs/toolkit';

import type { PageMeta, ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { SupportAccess } from 'modules/DigiKhaato/features/account-data/types/accountData.types';

import type {
  AdminHealth,
  AdminOverview,
  AdminPartnerRow,
  AdminPlan,
  AdminTenantDetail,
  AdminTenantFilters,
  AdminTenantPatch,
  AdminTenantRow,
} from '../types/admin.types';

/**
 * PLT-14 — the console's thunks. The service is imported inside each one, so
 * nothing of the console reaches a merchant's route (the impersonation banner
 * is the one caller outside `/admin`, and it is itself lazily loaded).
 */

const service = () => import('../api/adminService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchOverview = createAsyncThunk<AdminOverview, void, Reject>(
  'admin/fetchOverview',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getOverview(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'admin.error.body'));
    }
  }
);

export const fetchTenants = createAsyncThunk<
  { rows: AdminTenantRow[]; meta: PageMeta },
  AdminTenantFilters,
  Reject
>('admin/fetchTenants', async (filters, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listTenants(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'admin.error.body'));
  }
});

export const fetchTenantDetail = createAsyncThunk<AdminTenantDetail, string, Reject>(
  'admin/fetchTenantDetail',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getTenant(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'admin.error.body'));
    }
  }
);

export const updateTenant = createAsyncThunk<
  AdminTenantDetail,
  { readonly id: string; readonly patch: AdminTenantPatch },
  Reject
>('admin/updateTenant', async ({ id, patch }, { rejectWithValue }) => {
  try {
    return await (await service()).updateTenant(id, patch);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'admin.tenant.save.error'));
  }
});

export const fetchPartners = createAsyncThunk<AdminPartnerRow[], void, Reject>(
  'admin/fetchPartners',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listPartners(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'admin.error.body'));
    }
  }
);

export const fetchPlans = createAsyncThunk<AdminPlan[], void, Reject>(
  'admin/fetchPlans',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listPlans(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'admin.error.body'));
    }
  }
);

export const requestSupportAccess = createAsyncThunk<
  SupportAccess,
  { readonly id: string; readonly reason: string },
  Reject
>('admin/requestAccess', async ({ id, reason }, { rejectWithValue }) => {
  try {
    return await (await service()).requestAccess(id, reason);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'admin.access.error'));
  }
});

export const startImpersonation = createAsyncThunk<
  void,
  { readonly id: string; readonly consentId: string; readonly reason: string },
  Reject
>('admin/startImpersonation', async ({ id, consentId, reason }, { rejectWithValue }) => {
  try {
    await (await service()).impersonate(id, consentId, reason);
    return undefined;
  } catch (error) {
    return rejectWithValue(toApiError(error, 'admin.enter.error'));
  }
});

export const endImpersonation = createAsyncThunk<string | null, void, Reject>(
  'admin/endImpersonation',
  async (_arg, { rejectWithValue }) => {
    try {
      return await (await service()).endImpersonation();
    } catch (error) {
      return rejectWithValue(toApiError(error, 'admin.banner.endError'));
    }
  }
);

export const fetchHealth = createAsyncThunk<AdminHealth, void, Reject>(
  'admin/fetchHealth',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getHealth(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'admin.error.body'));
    }
  }
);
