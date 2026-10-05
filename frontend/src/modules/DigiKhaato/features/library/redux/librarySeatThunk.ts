import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type {
  LibrarySeat,
  LibraryShift,
  SeatMap,
  SeatRowFormValues,
  ShiftFormValues,
} from '../types/seat.types';

/**
 * W02 — the study library's shifts, seats and seat map. The service is
 * imported inside each thunk, like every library thunk file.
 */
const service = () => import('../api/librarySeatService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchLibraryShifts = createAsyncThunk<LibraryShift[], void, Reject>(
  'librarySeats/fetchShifts',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listShifts(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.seats.error.title'));
    }
  }
);

export const fetchLibrarySeats = createAsyncThunk<LibrarySeat[], void, Reject>(
  'librarySeats/fetchSeats',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listSeats(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.seats.error.title'));
    }
  }
);

export const fetchLibrarySeatMap = createAsyncThunk<SeatMap, string, Reject>(
  'librarySeats/fetchMap',
  async (shiftId, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getSeatMap(shiftId, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.seats.error.title'));
    }
  }
);

export const saveLibraryShift = createAsyncThunk<
  LibraryShift,
  { values: ShiftFormValues; existing?: LibraryShift },
  Reject
>('librarySeats/saveShift', async ({ values, existing }, { rejectWithValue }) => {
  try {
    return await (await service()).saveShift(values, existing);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.seats.error.save'));
  }
});

export const setLibraryShiftActive = createAsyncThunk<
  LibraryShift,
  { shift: LibraryShift; active: boolean },
  Reject
>('librarySeats/setShiftActive', async ({ shift, active }, { rejectWithValue }) => {
  try {
    return await (await service()).setShiftActive(shift, active);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.seats.error.save'));
  }
});

export const addLibrarySeatRow = createAsyncThunk<number, SeatRowFormValues, Reject>(
  'librarySeats/addRow',
  async (values, { rejectWithValue }) => {
    try {
      return await (await service()).addSeatRow(values);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.seats.error.save'));
    }
  }
);

export const setLibrarySeatActive = createAsyncThunk<
  LibrarySeat,
  { seat: LibrarySeat; active: boolean },
  Reject
>('librarySeats/setSeatActive', async ({ seat, active }, { rejectWithValue }) => {
  try {
    return await (await service()).setSeatActive(seat, active);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.seats.error.save'));
  }
});
