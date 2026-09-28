'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { buildWhatsAppUrl } from 'src/utils/share';

import { selectInvoiceDetail, type InvoiceDetailState } from '../redux/invoiceDetailSlice';
import {
  createInvoiceShareLink,
  fetchInvoice,
  fetchPrintBranding,
  fetchUpiIntent,
} from '../redux/salesThunk';

import type { PrintTemplate } from '../types/sales.types';

/**
 * SAL-03 — the detail page's data and its three acts: print (either template,
 * `window.print()` once the sheet is in the DOM and fonts are ready, FR-2),
 * copy link and WhatsApp (FR-5, FR-6). The print sheet reads the cached
 * document — no refetch at print time (§5).
 */
export interface UseInvoiceDetailResult extends InvoiceDetailState {
  readonly template: PrintTemplate;
  readonly setTemplate: (template: PrintTemplate) => void;
  readonly print: (template: PrintTemplate) => void;
  readonly share: (channel: 'link' | 'whatsapp') => Promise<void>;
  /** PAY-01 — re-read the bill after a payment against it moved its status. */
  readonly reload: () => void;
}

export const useInvoiceDetail = (id: string, autoPrint: boolean): UseInvoiceDetailResult => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const detail = useAppSelector(selectInvoiceDetail);
  const [template, setTemplate] = useState<PrintTemplate>('a4');
  const [printing, setPrinting] = useState(autoPrint);

  useEffect(() => {
    const doc = dispatch(fetchInvoice(id));
    const branding = dispatch(fetchPrintBranding());
    return () => {
      doc.abort();
      branding.abort();
    };
  }, [dispatch, id]);

  const status = detail.document?.id === id ? detail.document.status : null;
  useEffect(() => {
    // FR-9 — a draft prints with a watermark and no QR; an issued bill carries one.
    if (status && status !== 'draft') void dispatch(fetchUpiIntent(id));
  }, [dispatch, id, status]);

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
      const result = await dispatch(createInvoiceShareLink({ id: doc.id, channel }));
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
      const party = doc.partySnapshot?.name || doc.walkInName || t('sales.walkIn.customer');
      const text =
        doc.amountDue !== '0.00'
          ? t('sales.share.textDue', {
              party,
              shop: doc.supplier.name,
              number: doc.number ?? '',
              total: formatInr(doc.grandTotal),
              due: formatInr(doc.amountDue),
              dueDate: formatBusinessDate(doc.dueOn),
              link,
            })
          : t('sales.share.textPaid', {
              party,
              shop: doc.supplier.name,
              number: doc.number ?? '',
              total: formatInr(doc.grandTotal),
              link,
            });
      const mobile = doc.partySnapshot?.mobile ?? doc.walkInMobile;
      window.open(buildWhatsAppUrl(text, mobile), '_blank', 'noopener');
    },
    [dispatch, detail.document, t]
  );

  const reload = useCallback(() => {
    void dispatch(fetchInvoice(id));
  }, [dispatch, id]);

  return { ...detail, template, setTemplate, print, share, reload };
};
