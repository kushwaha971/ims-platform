'use client';

import { useCallback, useState } from 'react';

import { LifeBuoy } from 'lucide-react';

import { UbBox, UbButton, UbStack, UbText } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectImpersonation } from 'src/redux/slice/sessionSlice';
import { ROUTES, adminTenantPath } from 'src/routes';
import { formatTimestamp } from 'src/utils/dates';
import { replaceDocument } from 'src/utils/documentNavigation';

import { endImpersonation } from '../redux/adminThunk';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/admin';

/**
 * PLT-14 FR-5 / TSK-PLT-14-06 — the persistent red-outlined banner of a support
 * session: who is acting, in which business, until when, and the way out. It
 * cannot be dismissed. `dynamic()`-loaded by the shell only while `/auth/me`
 * says this tab is a support session, so no merchant ever downloads it.
 *
 * Ending is a DOCUMENT load back to the console, for the reason entering was:
 * nothing of the business's state may survive into the operator's own session.
 * If the token simply runs out, the next request's refresh brings back the
 * operator's own session and the banner goes with it.
 */
export function ImpersonationBanner(): React.JSX.Element | null {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectImpersonation);
  const [ending, setEnding] = useState(false);

  const end = useCallback(async () => {
    setEnding(true);
    try {
      const tenantId = await dispatch(endImpersonation()).unwrap();
      replaceDocument(tenantId ? adminTenantPath(tenantId) : ROUTES.ADMIN_TENANTS);
    } catch {
      setEnding(false); // the refusal reaches the global snackbar
    }
  }, [dispatch]);

  if (!session) return null;
  return (
    <UbBox
      role="status"
      data-print="hide"
      className="border-error-600 mx-4 mt-3 rounded-card border-2 bg-surface-card px-4 py-3 lg:mx-6"
    >
      <UbStack direction="row" align="center" gap={3} wrap>
        <LifeBuoy aria-hidden className="text-error-600 h-5 w-5 shrink-0" />
        <UbText as="span" variant="body-sm-medium" className="min-w-0 flex-1">
          {t('admin.banner.text', {
            admin: session.adminName,
            tenant: session.tenantName,
            time: formatTimestamp(session.expiresAt),
          })}
        </UbText>
        <UbButton size="sm" variant="destructive" busy={ending} onClick={() => void end()}>
          {t('admin.banner.end')}
        </UbButton>
      </UbStack>
    </UbBox>
  );
}
