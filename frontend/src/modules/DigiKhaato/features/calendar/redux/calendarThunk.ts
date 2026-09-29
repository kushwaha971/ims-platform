import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as calendarService from '../api/calendarService';

import type {
  AddedClosedDays,
  BusinessDays,
  ClosedDayDraft,
  SavedWeekdays,
  WeekdaysDraft,
} from '../types/calendar.types';

/** QUERY — the next twelve months of closures and the weekday rules. */
export const fetchBusinessDays = createAsyncThunk<
  BusinessDays,
  { readonly from: string; readonly to: string },
  { rejectValue: ApiErrorShape }
>('calendar/fetch', async (range, { signal, rejectWithValue }) => {
  try {
    return await calendarService.listClosedDays(range, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'calendar.error.title'));
  }
});

/** MUTATION — the weekday rules, saved the moment a chip or switch changes. */
export const saveWeekdays = createAsyncThunk<
  SavedWeekdays,
  WeekdaysDraft,
  { rejectValue: ApiErrorShape }
>('calendar/saveWeekdays', async (draft, { rejectWithValue }) => {
  try {
    return await calendarService.saveWeekdays(draft);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'calendar.error.title'));
  }
});

/** MUTATION — a range of closed days. */
export const addClosedDays = createAsyncThunk<
  AddedClosedDays,
  ClosedDayDraft,
  { rejectValue: ApiErrorShape }
>('calendar/add', async (draft, { rejectWithValue }) => {
  try {
    return await calendarService.addClosedDays(draft);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'calendar.error.title'));
  }
});

/** MUTATION — one closure removed. */
export const deleteClosedDay = createAsyncThunk<string, string, { rejectValue: ApiErrorShape }>(
  'calendar/delete',
  async (id, { rejectWithValue }) => {
    try {
      await calendarService.deleteClosedDay(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'calendar.error.title'));
    }
  }
);
