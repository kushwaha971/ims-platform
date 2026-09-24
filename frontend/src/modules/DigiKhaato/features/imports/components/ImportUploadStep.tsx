'use client';

import { useCallback } from 'react';

import { Download } from 'lucide-react';

import {
  UbActionLink,
  UbCard,
  UbFileUpload,
  UbProgress,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { importTemplateUrl } from '../api/importService';
import { IMPORT_ACCEPT, IMPORT_MAX_BYTES } from '../constants/importKinds';

import type { UseImportWizardResult } from '../hooks/useImportWizard';
import type { ImportKind } from '../types/import.types';

/**
 * Step 2 (IMP-01 §7) — get the template, choose the file. A wrong extension or
 * a file over 5 MB is refused HERE, with the sentence the server would give
 * (EC-3), so nobody waits for an upload that was always going to fail.
 */
export function ImportUploadStep({
  kind,
  wizard,
}: Readonly<{ kind: ImportKind; wizard: UseImportWizardResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const uploading = wizard.upload.status === 'loading';

  const reject = useCallback(
    (reason: 'too_large' | 'wrong_type') =>
      dispatch(
        showSnackbar({
          severity: 'warning',
          id: reason === 'too_large' ? 'imports.upload.tooLarge' : 'imports.upload.wrongType',
        })
      ),
    [dispatch]
  );

  if (!wizard.canImport(kind)) {
    return (
      <UbStatusBanner
        tone="warning"
        title={t('imports.upload.noAccess.title')}
        description={t('imports.upload.noAccess.body')}
      />
    );
  }

  return (
    <UbStack gap={4}>
      <UbCard title={t('imports.template.title')} description={t(`imports.template.hint.${kind}`)}>
        <UbActionLink
          href={importTemplateUrl(kind)}
          download
          variant="secondary"
          icon={<Download className="h-4 w-4" aria-hidden />}
        >
          {t('imports.template.download')}
        </UbActionLink>
      </UbCard>

      <UbCard title={t('imports.upload.title')} description={t('imports.upload.limits')}>
        <UbStack gap={3}>
          <UbFileUpload
            label={t('imports.upload.choose')}
            accept={IMPORT_ACCEPT}
            maxBytes={IMPORT_MAX_BYTES}
            disabled={uploading}
            onSelect={wizard.start}
            onReject={reject}
          />
          {uploading && (
            <UbStack gap={1} aria-live="polite">
              <UbText as="span" variant="caption" tone="secondary">
                {wizard.upload.percent === null
                  ? t('imports.upload.uploading')
                  : t('imports.upload.percent', { percent: wizard.upload.percent })}
              </UbText>
              <UbProgress
                percent={wizard.upload.percent ?? 0}
                tone="accent"
                ariaLabel={t('imports.upload.uploading')}
              />
            </UbStack>
          )}
          <UbText as="p" variant="body-sm" tone="tertiary">
            {t('imports.promise')}
          </UbText>
        </UbStack>
      </UbCard>
    </UbStack>
  );
}
