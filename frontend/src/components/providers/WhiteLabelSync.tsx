'use client';

import { useEffect } from 'react';

import { absoluteFileUrl } from 'src/api/apiUrl';
import { APP_NAME } from 'src/constants';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { applyWhiteLabel } from 'src/redux/slice/whiteLabelSlice';
import { readLocal, removeLocal, writeLocal } from 'src/utils/storage';
import {
  BRAND_CSS_PROPERTIES,
  brandCssVariables,
  HEX_COLOUR,
  THEME_CACHE_KEY,
} from 'src/utils/theme';

interface ThemeCache {
  readonly tenantId: string;
  readonly vars: Readonly<Record<string, string>>;
}

/**
 * WLB-01 FR-4 — the tenant's brand on the running app.
 *
 * Reads the resolved branding `/auth/me` carries for the ACTIVE tenant and does
 * three things with it: writes the primary ramp onto `<html>` (and only the
 * ramp — BR-1), tells the white-label slice the app name and logo the shell
 * prints, and caches the ramp for the pre-paint script in `app/layout.tsx`, so
 * the next load starts in the shop's colour instead of flashing indigo first.
 *
 * The product default is NOT written as overrides: the hand-tuned tokens in
 * `light.css` / `dark.css` are better than a computed ramp of the same hex,
 * so "default" means "remove every override", not "write indigo again".
 *
 * EC-6: the cache is keyed by tenant id and dropped the moment the active
 * tenant has no custom colour — a switch to another business never paints
 * the previous one's brand past the first frame.
 */
export function WhiteLabelSync(): null {
  const dispatch = useAppDispatch();
  const tenant = useAppSelector(selectActiveTenant);
  const branding = tenant?.branding ?? null;
  const tenantId = tenant?.id ?? null;
  const hex = branding && branding.primarySource !== 'default' ? branding.primaryHex : null;

  useEffect(() => {
    const root = document.documentElement;
    if (hex && tenantId && HEX_COLOUR.test(hex)) {
      const vars = brandCssVariables(hex);
      for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
      writeLocal(THEME_CACHE_KEY, { tenantId, vars } satisfies ThemeCache);
      return;
    }
    for (const name of BRAND_CSS_PROPERTIES) root.style.removeProperty(name);
    if (readLocal<ThemeCache | null>(THEME_CACHE_KEY, null)) removeLocal(THEME_CACHE_KEY);
  }, [hex, tenantId]);

  useEffect(() => {
    dispatch(
      applyWhiteLabel({
        appName: branding?.appName || APP_NAME,
        primaryHex: hex,
        logoUrl: branding?.logoUrl ? absoluteFileUrl(branding.logoUrl) : null,
      })
    );
  }, [dispatch, branding?.appName, branding?.logoUrl, hex]);

  return null;
}
