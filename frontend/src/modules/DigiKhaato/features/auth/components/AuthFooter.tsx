'use client';

import { memo } from 'react';

import { UbBottomBar, UbDivider, UbStack, UbText } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';

import { AuthLegalNotice } from './AuthLegalNotice';
import { LanguagePicker } from './LanguagePicker';
import { ThemePicker } from './ThemePicker';

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
 *
 * ── CR-2026-09-19-G ─────────────────────────────────────────────────────────
 * It is a `UbBottomBar` (`sticky={false}` — it is at the end of a `min-h-dvh`
 * column, not pinned to the viewport, and that should not change). The wrapper
 * is what publishes `--ub-bottom-inset`, and it is here because the global
 * toast was landing squarely on this row: on every `(auth)` screen at 360, 768
 * and 1280, an error message covered the legal links and the LANGUAGE PICKER —
 * the one control a merchant who cannot read the English error is looking for.
 * `UbBottomBar` reports how much of the viewport bottom this footer actually
 * occupies, so the toast rides above it when it is on screen and keeps its
 * plain safe-area offset when the footer is scrolled below the fold.
 *
 * It renders the same `<footer>` element it always did, so `contentinfo` is
 * still the page's one `contentinfo`.
 */
function AuthFooterBase(): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  return (
    <UbBottomBar as="footer" sticky={false} className="relative px-4 pb-8 pt-4">
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
          {/* Last controls on the page, exactly as Notion places the language
              one. Both are preferences a person must be able to set before they
              have an account, which is why they live here and not in settings. */}
          <UbStack direction="row" align="center" gap={2}>
            <ThemePicker />
            <LanguagePicker />
          </UbStack>
        </UbStack>
      </UbStack>
    </UbBottomBar>
  );
}

AuthFooterBase.displayName = 'AuthFooter';
export const AuthFooter = memo(AuthFooterBase);
