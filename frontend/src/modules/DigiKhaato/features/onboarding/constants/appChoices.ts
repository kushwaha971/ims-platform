import { BookOpen, HandCoins, LayoutGrid, Store, type LucideIcon } from 'lucide-react';

/**
 * Step 1's app choice — the client's WORDS for each app the server offers.
 *
 * Which apps exist, which are released and which a plan includes are the
 * server's to say (`GET /onboarding/apps`); nothing here can add one to the
 * list or keep one on it. This only supplies an icon and one line saying what
 * the app is FOR, because a name alone ("Lending") does not tell somebody
 * setting up their first business whether it is the thing they need.
 *
 * An app the server offers and this table has not heard of still appears,
 * with its own name and the generic line — a new app must never be invisible
 * at sign-up because one file was not updated (that is how Library and
 * Lending went missing here in the first place).
 */
export interface AppChoiceConfig {
  readonly icon: LucideIcon;
  /** i18n key — one line on what the app is for. */
  readonly hintId: string;
}

/** The app whose defaults the business-type tiles set. */
export const SHOP_APP = 'shop';

const APP_CHOICES: Readonly<Record<string, AppChoiceConfig>> = {
  shop: { icon: Store, hintId: 'onboarding.apps.shop.hint' },
  library: { icon: BookOpen, hintId: 'onboarding.apps.library.hint' },
  lending: { icon: HandCoins, hintId: 'onboarding.apps.lending.hint' },
};

const OTHER_APP: AppChoiceConfig = { icon: LayoutGrid, hintId: 'onboarding.apps.other.hint' };

export const appChoiceConfig = (code: string): AppChoiceConfig => APP_CHOICES[code] ?? OTHER_APP;
