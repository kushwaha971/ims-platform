import { act, renderHook } from '@testing-library/react';
import { useForm, useWatch } from 'react-hook-form';

import { SERVER_AUTOSAVE_MS } from '../constants/salesConstants';
import { emptyInvoiceForm } from '../view-model/invoiceForm';

import { useDraftAutosave } from './useDraftAutosave';

import type { UseInvoiceEditorResult } from './useInvoiceEditor';

jest.mock('src/hooks/useAppStore', () => ({ useAppSelector: () => false }));
jest.mock('src/utils/localDrafts', () => ({
  localDraftKey: () => 'test-draft',
  readLocalDraft: () => null,
  writeLocalDraft: jest.fn(),
  removeLocalDraft: jest.fn(),
}));

it('keeps edits made during an in-flight save dirty and saves them next', async () => {
  jest.useFakeTimers();
  let complete!: (value: unknown) => void;
  const save = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    )
    .mockResolvedValue(null);
  const { result, unmount } = renderHook(() => {
    const form = useForm({ defaultValues: emptyInvoiceForm('2026-10-16', 'party', '') });
    const values = useWatch({ control: form.control });
    const autosave = useDraftAutosave(
      {
        form,
        values,
        save,
        kind: 'invoice',
        editor: { documentId: 'draft-id', version: 1, loadStatus: 'succeeded', saveState: 'idle' },
      } as unknown as UseInvoiceEditorResult,
      'draft-id'
    );
    return { form, autosave };
  });
  act(() => result.current.form.setValue('partyId', 'customer-a', { shouldDirty: true }));
  act(() => jest.advanceTimersByTime(SERVER_AUTOSAVE_MS));
  expect(save).toHaveBeenCalledTimes(1);
  act(() => result.current.form.setValue('partyId', 'customer-b', { shouldDirty: true }));
  // The second debounce expires before the slow first request finishes.
  act(() => jest.advanceTimersByTime(SERVER_AUTOSAVE_MS));
  await act(async () => {
    complete({});
  });
  expect(result.current.autosave.dirty).toBe(true);
  act(() => jest.advanceTimersByTime(SERVER_AUTOSAVE_MS));
  expect(save).toHaveBeenCalledTimes(2);
  unmount();
  jest.useRealTimers();
});
