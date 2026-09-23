// @lint-at: hooks/usePartyThunkProbe.ts
// @expect: no-restricted-imports
// The list's thunk is the other door to the same endpoint. Dispatched from a
// picker with a `q`, it would also overwrite the list screen's rows.
import { useEffect } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';

import { DEFAULT_PARTY_FILTERS } from 'modules/DigiKhaato/features/parties/redux/partyListSlice';
import { fetchPartyList } from 'modules/DigiKhaato/features/parties/redux/partyListThunk';

export function usePartyThunkProbe(q: string): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const promise = dispatch(
      fetchPartyList({ params: { ...DEFAULT_PARTY_FILTERS, q }, mode: 'replace' })
    );
    return () => promise.abort();
  }, [dispatch, q]);
}
