'use client';

import { UbCombobox } from 'src/design-system/UbCombobox/UbCombobox';
import type { UbSelectOption } from 'src/design-system/UbSelect/UbSelect';
import { DEFAULT_PHONE_COUNTRY } from 'src/utils/phone';
import { PHONE_COUNTRIES, phoneCountry, type PhoneCountry } from 'src/utils/phoneCountries';

/**
 * `UbPhoneInput`'s country code: ml-uikit's searchable list (`UbCombobox`:
 * MLPopover + MLCommand), owner, 9 Oct 2026. Its own module so the phone field
 * paints without it and fetches it right after (see `UbPhoneInput`).
 *
 * 243 countries want a search box: a typed "uae" or "971" finds one faster than
 * scrolling. The closed trigger shows only the code; the open list names
 * countries in the app's language (`Intl.DisplayNames`, so no names ship).
 */
/** Option lists, built once per language: names come from `Intl`. */
const optionsByLocale = new Map<string, readonly UbSelectOption[]>();

export const countryOptions = (locale: string): readonly UbSelectOption[] => {
  const cached = optionsByLocale.get(locale);
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  } catch {
    names = null;
  }
  const label = (country: PhoneCountry) =>
    `${names?.of(country.iso) ?? country.iso} (+${country.dial})`;
  const collator = new Intl.Collator(locale);
  const india = phoneCountry(DEFAULT_PHONE_COUNTRY);
  const rest = PHONE_COUNTRIES.filter((country) => country.iso !== india.iso);
  const options = [
    // India first: it is the default and the way back to it.
    { value: india.iso, label: label(india) },
    ...rest
      .map((country) => ({ value: country.iso, label: label(country) }))
      .sort((a, b) => collator.compare(a.label, b.label)),
  ];
  optionsByLocale.set(locale, options);
  return options;
};

export interface UbPhoneCountryPickerProps {
  readonly value: string;
  readonly onChange: (iso: string) => void;
  readonly locale: string;
  readonly label: string;
  readonly searchPlaceholder: string;
  readonly emptyLabel: string;
  readonly disabled?: boolean;
  readonly dial: string;
  readonly onCloseAutoFocus: (event: Event) => void;
}

export function UbPhoneCountryPicker({
  value,
  onChange,
  locale,
  label,
  searchPlaceholder,
  emptyLabel,
  disabled,
  dial,
  onCloseAutoFocus,
}: UbPhoneCountryPickerProps): React.JSX.Element {
  return (
    <UbCombobox
      value={value}
      onChange={onChange}
      options={countryOptions(locale)}
      aria-label={label}
      searchPlaceholder={searchPlaceholder}
      emptyLabel={emptyLabel}
      disabled={disabled}
      triggerContent={dial}
      className="h-8 w-auto gap-1 border-transparent bg-transparent px-2 text-text-secondary hover:border-transparent disabled:bg-transparent"
      contentClassName="w-72 max-w-[calc(100vw-2rem)]"
      onCloseAutoFocus={onCloseAutoFocus}
    />
  );
}
