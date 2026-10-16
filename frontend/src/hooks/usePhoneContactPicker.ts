'use client';

import { useState, useSyncExternalStore } from 'react';

import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import {
  phoneContactsSupported,
  pickPhoneContact,
  type PickedPhoneContact,
} from 'src/utils/phoneContacts';

import { useAppDispatch } from './useAppStore';

const subscribe = () => () => {};
const serverSupport = () => false;

/** Explicit, one-contact prefill; `PhoneContactButton` is its one caller's shape. */
export function usePhoneContactPicker(
  onPick: (contact: PickedPhoneContact) => void,
  errorMessage: string
): { supported: boolean; busy: boolean; choose: () => Promise<void> } {
  const supported = useSyncExternalStore(subscribe, phoneContactsSupported, serverSupport);
  const [busy, setBusy] = useState(false);
  const dispatch = useAppDispatch();
  const choose = async () => {
    setBusy(true);
    try {
      const contact = await pickPhoneContact();
      if (contact) onPick(contact);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        dispatch(showSnackbar({ severity: 'error', message: errorMessage }));
      }
    } finally {
      setBusy(false);
    }
  };
  return { supported, busy, choose };
}
