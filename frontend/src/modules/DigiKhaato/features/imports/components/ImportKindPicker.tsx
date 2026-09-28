'use client';

import { Download, Package, Users } from 'lucide-react';

import { UbActionLink, UbCard, UbGrid, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { importKindPath } from 'src/routes';

import { importTemplateUrl } from '../api/importService';
import { IMPORT_KIND_ORDER } from '../constants/importKinds';

import type { ImportKind } from '../types/import.types';

const ICON: Readonly<Record<ImportKind, React.ReactNode>> = {
  parties: <Users className="h-5 w-5" aria-hidden />,
  items: <Package className="h-5 w-5" aria-hidden />,
};

/**
 * Step 1 (IMP-01 §7) — one card per kind: what it brings in, its template,
 * and the way in. A kind the member may not import is shown with the reason
 * ("Ask the owner") instead of a Choose that would refuse.
 */
export function ImportKindPicker({
  canImport,
}: Readonly<{ canImport: (kind: ImportKind) => boolean }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbGrid columns={{ base: 1, md: 2 }} gap={4}>
      {IMPORT_KIND_ORDER.map((kind) => {
        const allowed = canImport(kind);
        return (
          <UbCard
            key={kind}
            title={t(`imports.kind.${kind}.title`)}
            description={t(`imports.kind.${kind}.body`)}
          >
            <UbStack gap={3}>
              <UbStack direction="row" gap={2} align="center">
                {ICON[kind]}
                <UbText as="span" variant="body-sm" tone="tertiary">
                  {t(`imports.kind.${kind}.columns`)}
                </UbText>
              </UbStack>
              <UbStack direction="row" gap={2} wrap>
                <UbActionLink
                  href={importTemplateUrl(kind)}
                  download
                  variant="ghost"
                  icon={<Download className="h-4 w-4" aria-hidden />}
                >
                  {t('imports.template.download')}
                </UbActionLink>
                {allowed ? (
                  <UbActionLink href={importKindPath(kind)} variant="primary">
                    {t('imports.kind.choose')}
                  </UbActionLink>
                ) : (
                  <UbText as="span" variant="caption" tone="tertiary">
                    {t('imports.kind.askOwner')}
                  </UbText>
                )}
              </UbStack>
            </UbStack>
          </UbCard>
        );
      })}
    </UbGrid>
  );
}
