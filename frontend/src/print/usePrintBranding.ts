'use client';

import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';

import { selectPrintBranding } from './printBrandingSlice';
import { fetchPrintBranding } from './printBrandingThunk';

import type { PrintBranding } from './brandingPrintService';

/**
 * R33 / A16 — the letterhead for the print sheet on screen. Fetched when a
 * screen that prints mounts, and aborted when it unmounts, exactly as the
 * invoice and receipt screens each did before; `null` until it arrives, which
 * every print sheet already renders as "no logo".
 */
export const usePrintBranding = (): PrintBranding | null => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const request = dispatch(fetchPrintBranding());
    return () => request.abort();
  }, [dispatch]);
  return useAppSelector(selectPrintBranding);
};
