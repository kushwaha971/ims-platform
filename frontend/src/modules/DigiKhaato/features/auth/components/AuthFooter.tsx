'use client';

import { memo } from 'react';

import { UbBox, UbDivider, UbStack, UbText } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';

import { AuthLegalNotice } from './AuthLegalNotice';
import { LanguagePicker } from './LanguagePicker';

/**
 * CR-2026-09-19-D — the `(auth)` group's page footer.
 *
 * This is the half of "a form floating in a black void" that a card cannot fix.
 * A page has a bottom: Zoho's sign-in carries a copyright line, Notion's carries
 * the legal links and the language picker. Ours carries all three, and they are
 * the same three on every screen in the group, which is what makes the group
 * read as one product rather than five forms.
 *
 * It renders a real `<footer>` landmark (through `UbBox as="footer"`), so the
 * page now has `main` and `contentinfo` where before it had neither.
 *
 * The year is computed at render. That is a deliberate client-side read of the
 * clock in a component that is otherwise pure: a copyright year baked at build
 * time is wrong from the first of January until somebody redeploys.
 */
function AuthFooterBase(): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  return (
    <UbBox as="footer" className="relative px-4 pb-8 pt-4">
      <UbStack gap={4} align="center" className="mx-auto w-full max-w-[560px]">
        <UbDivider decorative className="opacity-60" />
        <AuthLegalNotice />
        <UbStack
          direction="column-reverse"
          align="center"
          justify="between"
          gap={3}
          className="w-full sm:flex-row"
        >
          <UbText variant="caption" tone="muted">
            {t('auth.footer.copyright', { year: new Date().getFullYear(), appName })}
          </UbText>
          {/* Last control on the page, exactly as Notion places it. */}
          <LanguagePicker />
        </UbStack>
      </UbStack>
    </UbBox>
  );
}

AuthFooterBase.displayName = 'AuthFooter';
export const AuthFooter = memo(AuthFooterBase);
