import { resetAllFeatureState } from 'src/redux/actions';

import { makeDocument } from '../testing/salesFixtures';


import { editorReset, invoiceEditorReducer } from './invoiceEditorSlice';
import { fetchInvoice, saveInvoiceDraft, type SaveDraftArg } from './salesThunk';

import type { SalesDocumentEnvelope } from '../types/sales.types';

const arg: SaveDraftArg = { id: null, version: null, body: {}, quiet: true };
const envelope = (over: Partial<SalesDocumentEnvelope> = {}): SalesDocumentEnvelope => ({
  document: makeDocument({ status: 'draft', number: null, version: 1 }),
  warnings: [],
  rule46: null,
  partyBalance: null,
  ledgerEntryId: null,
  ...over,
});

it.each([editorReset(), resetAllFeatureState()])('ignores old saves after reset: %s', (reset) => {
  let state = invoiceEditorReducer(undefined, saveInvoiceDraft.pending('old', arg));
  state = invoiceEditorReducer(state, reset);
  state = invoiceEditorReducer(state, saveInvoiceDraft.fulfilled(envelope(), 'old', arg));
  expect(state.documentId).toBeNull();
});

it('ignores an out-of-order load from a previous editor', () => {
  let state = invoiceEditorReducer(undefined, fetchInvoice.pending('old', 'old-doc'));
  state = invoiceEditorReducer(state, fetchInvoice.pending('current', 'current-doc'));
  state = invoiceEditorReducer(state, fetchInvoice.fulfilled(envelope(), 'old', 'old-doc'));
  expect(state.documentId).toBeNull();
  expect(state.loadStatus).toBe('loading');
});

it('locks a recovered posted document instead of issuing or editing it again', () => {
  let state = invoiceEditorReducer(undefined, saveInvoiceDraft.pending('save', arg));
  const posted = envelope({ document: makeDocument({ status: 'issued' }), draftRecovered: true });
  state = invoiceEditorReducer(state, saveInvoiceDraft.fulfilled(posted, 'save', arg));
  expect(state.issued?.document.id).toBe(posted.document.id);
  expect(state.saveState).toBe('saved');
});
