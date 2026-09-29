'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import type { PrintBranding } from 'src/print/brandingPrintService';
import { usePrintBranding } from 'src/print/usePrintBranding';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { buildWhatsAppUrl } from 'src/utils/share';

import { selectInvoiceDetail, type InvoiceDetailState } from '../redux/invoiceDetailSlice';
import { fetchFlowDocument } from '../redux/salesFlowThunk';
import {
  createInvoiceShareLink,
  fetchInvoice,
  fetchUpiIntent,
  revokeInvoiceShareLink,
} from '../redux/salesThunk';

import type { PrintTemplate, SalesDocument } from '../types/sales.types';
import type { FlowKind } from '../types/salesFlows.types';

type DetailKind = 'invoice' | FlowKind;

/** SAL-03 BR-3 / SAL-01 §17 / SAL-04 §17 — the WhatsApp text each kind sends. */
const shareText = (
  doc: SalesDocument,
  link: string,
  t: (id: string, values?: Record<string, string>) => string
): string => {
  const party = doc.partySnapshot?.name || doc.walkInName || t('sales.walkIn.customer');
  const base = { party, shop: doc.supplier.name, number: doc.number ?? '', link };
  if (doc.kind === 'estimate') {
    return t('sales.estimate.shareText', {
      ...base,
      total: formatInr(doc.grandTotal),
      validUntil: formatBusinessDate(doc.validUntil),
    });
  }
  if (doc.kind === 'credit_note') {
    return t('sales.creditNote.shareText', {
      ...base,
      total: formatInr(doc.grandTotal),
      against: doc.links.against?.number ?? '',
    });
  }
  return doc.amountDue !== '0.00'
    ? t('sales.share.textDue', {
        ...base,
        total: formatInr(doc.grandTotal),
        due: formatInr(doc.amountDue),
        dueDate: formatBusinessDate(doc.dueOn),
      })
    : t('sales.share.textPaid', { ...base, total: formatInr(doc.grandTotal) });
};

/**
 * SAL-03 — the detail page's data and its three acts: print (either template,
 * `window.print()` once the sheet is in the DOM and fonts are ready, FR-2),
 * copy link and WhatsApp (FR-5, FR-6). The print sheet reads the cached
 * document — no refetch at print time (§5).
 */
export interface UseInvoiceDetailResult extends InvoiceDetailState {
  /** The letterhead (R33, A16 — `src/print`); `null` until it arrives. */
  readonly branding: PrintBranding | null;
  readonly template: PrintTemplate;
  readonly setTemplate: (template: PrintTemplate) => void;
  readonly print: (template: PrintTemplate) => void;
  readonly share: (channel: 'link' | 'whatsapp') => Promise<void>;
  /** UAT D1 — owner/admin: the old link stops working and a new one is copied. */
  readonly resetLink: () => Promise<void>;
  /** PAY-01 — re-read the bill after a payment against it moved its status. */
  readonly reload: () => void;
}

export const useInvoiceDetail = (
  id: string,
  autoPrint: boolean,
  kind: DetailKind = 'invoice'
): UseInvoiceDetailResult => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const detail = useAppSelector(selectInvoiceDetail);
  const branding = usePrintBranding();
  const [template, setTemplate] = useState<PrintTemplate>('a4');
  const [printing, setPrinting] = useState(autoPrint);

  useEffect(() => {
    const doc =
      kind === 'invoice' ? dispatch(fetchInvoice(id)) : dispatch(fetchFlowDocument({ kind, id }));
    return () => {
      doc.abort();
    };
  }, [dispatch, id, kind]);

  const status = detail.document?.id === id ? detail.document.status : null;
  useEffect(() => {
    // FR-9 — a draft prints with a watermark and no QR; an issued bill carries one.
    // Only a bill asks to be paid: an estimate and a credit note carry no QR.
    if (kind === 'invoice' && status && status !== 'draft') void dispatch(fetchUpiIntent(id));
  }, [dispatch, id, status, kind]);

  const print = useCallback((next: PrintTemplate) => {
    setTemplate(next);
    setPrinting(true);
  }, []);

  // Print only after the chosen sheet has rendered and the fonts are in. A
  // `?print=1` arrival (the success sheet, SAL-03 US-1) starts with `printing`
  // already true and simply waits here for the bill to load.
  const loaded = status !== null;
  const number = detail.document?.number;
  useEffect(() => {
    if (!printing || !loaded) return;
    const fonts = typeof document !== 'undefined' ? document.fonts?.ready : undefined;
    void Promise.resolve(fonts).then(() => {
      window.setTimeout(() => {
        const previous = document.title;
        document.title = number ?? previous; // FR-7 — the PDF's filename
        window.print();
        document.title = previous;
        setPrinting(false);
      }, 50);
    });
  }, [printing, loaded, number]);

  const share = useCallback(
    async (channel: 'link' | 'whatsapp') => {
      const doc = detail.document;
      if (!doc) return;
      const result = await dispatch(createInvoiceShareLink({ id: doc.id, channel, kind }));
      if (!createInvoiceShareLink.fulfilled.match(result)) return;
      const link = result.payload.url;
      if (channel === 'link') {
        try {
          await navigator.clipboard.writeText(link);
          dispatch(showSnackbar({ severity: 'success', id: 'share.copied' }));
        } catch {
          dispatch(showSnackbar({ severity: 'error', id: 'share.copyFailed' }));
        }
        return;
      }
      const text = shareText(doc, link, t);
      const mobile = doc.partySnapshot?.mobile ?? doc.walkInMobile;
      window.open(buildWhatsAppUrl(text, mobile), '_blank', 'noopener');
    },
    [dispatch, detail.document, t, kind]
  );

  const resetLink = useCallback(async () => {
    const doc = detail.document;
    if (!doc) return;
    const revoked = await dispatch(revokeInvoiceShareLink({ id: doc.id, kind }));
    if (!revokeInvoiceShareLink.fulfilled.match(revoked)) return;
    const result = await dispatch(createInvoiceShareLink({ id: doc.id, channel: 'link', kind }));
    if (!createInvoiceShareLink.fulfilled.match(result)) return;
    try {
      await navigator.clipboard.writeText(result.payload.url);
      dispatch(showSnackbar({ severity: 'success', id: 'sales.share.resetDone' }));
    } catch {
      dispatch(showSnackbar({ severity: 'error', id: 'share.copyFailed' }));
    }
  }, [dispatch, detail.document, kind]);

  const reload = useCallback(() => {
    void dispatch(fetchInvoice(id));
  }, [dispatch, id]);

  return { ...detail, branding, template, setTemplate, print, share, resetLink, reload };
};
