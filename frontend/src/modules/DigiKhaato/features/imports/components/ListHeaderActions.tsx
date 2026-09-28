'use client';

import { Download, Upload } from 'lucide-react';

import { UbActionLink, UbButton } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { importKindPath } from 'src/routes';
import type { PermissionCode } from 'src/types/domain.types';

import { IMPORT_ACCESS } from '../constants/importAccess';
import { useListExport } from '../hooks/useListExport';

import type { ImportKind } from '../types/import.types';

/**
 * The two header actions IMP-01 FR-14 and IMP-02 FR-13 put on a module's list:
 * "Import" (the wizard with this kind chosen) and "Export" (this list, with
 * its filters, as a CSV). Both follow the owner's header rule — icon-only
 * 32 px squares on a phone, wrapping below-left when they do not fit — and
 * both are HIDDEN rather than disabled for a member who may not use them
 * (§19.7.5): a control that refuses is a support call.
 *
 * Kept light on purpose, because they are imported into the list routes'
 * own chunks: no wizard, no slice, no service — the export's service loads on
 * the press, and the wizard is a different route.
 */

export function ImportActionLink({
  kind,
}: Readonly<{ kind: ImportKind }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { canAll, hasModule } = usePermissions();
  const config = IMPORT_ACCESS[kind];
  if (!config.modules.every((module) => hasModule(module)) || !canAll(config.write)) return null;
  return (
    <UbActionLink
      href={importKindPath(kind)}
      variant="secondary"
      icon={<Upload className="h-4 w-4" aria-hidden />}
      iconOnly="mobile"
    >
      {t('imports.action.import')}
    </UbActionLink>
  );
}

export interface ListExportButtonProps {
  /** The list's API path WITH its current filters — the file is the screen. */
  readonly listPath: string;
  /** The codename this list's export needs (`parties.party.export`, `reports.export`). */
  readonly permission: PermissionCode;
  /** Nothing to export: disabled with the reason in its name (IMP-02 §9). */
  readonly empty?: boolean;
}

export function ListExportButton({
  listPath,
  permission,
  empty = false,
}: Readonly<ListExportButtonProps>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { exporting, start } = useListExport(listPath);
  if (!can(permission)) return null;
  return (
    <UbButton
      variant="secondary"
      icon={<Download className="h-4 w-4" aria-hidden />}
      iconOnly="mobile"
      busy={exporting}
      busyLabel={t('exports.preparing')}
      disabled={empty}
      title={empty ? t('exports.empty') : undefined}
      onClick={start}
    >
      {t('exports.action')}
    </UbButton>
  );
}
