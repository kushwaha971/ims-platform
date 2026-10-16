import { renderHook } from '@testing-library/react';

import { ROUTES } from 'src/routes';

import { useEditorWindowEffects } from './useEditorWindowEffects';

/** A saved estimate/order/challan must reload its own editor, never an invoice 404. */
it.each([
  ROUTES.SALES_INVOICES,
  ROUTES.SALES_ESTIMATES,
  ROUTES.SALES_ORDERS,
  ROUTES.SALES_CHALLANS,
])('keeps the document family in the recovered draft URL: %s', (basePath) => {
  const replace = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
  renderHook(() =>
    useEditorWindowEffects({
      documentId: null,
      savedId: 'draft-id',
      dirty: false,
      onSave: jest.fn(),
      onIssue: jest.fn(),
      ...{ basePath },
    })
  );
  expect(replace).toHaveBeenCalledWith(null, '', `${basePath}/draft-id/edit`);
  replace.mockRestore();
});
