import { createAction } from '@reduxjs/toolkit';

/**
 * The plain actions the import thunks dispatch. In their own module rather
 * than on the slice, because the thunks are imported by the invalidation
 * registry (which is in the shell) and the slice must stay route-local: a
 * thunk that imported the slice would drag it onto every route.
 */
export const importUploadProgressed = createAction<number>('importJob/uploadProgressed');
