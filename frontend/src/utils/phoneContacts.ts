import { IN_DIAL_CODE } from './phone';

/** Browser contact access is one user-selected contact, never an address-book sync. */
interface ContactNavigator extends Navigator {
  contacts?: {
    select: (
      properties: string[],
      options: { multiple: boolean }
    ) => Promise<{ name?: string[]; tel?: string[] }[]>;
  };
}
export function phoneContactsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof (navigator as ContactNavigator).contacts?.select === 'function'
  );
}
export async function pickPhoneContact(): Promise<{ name: string; mobile: string } | null> {
  const picker = (navigator as ContactNavigator).contacts;
  if (!picker || !phoneContactsSupported()) return null;
  const [contact] = await picker.select(['name', 'tel'], { multiple: false });
  if (!contact) return null;
  const phone = (contact.tel?.[0] ?? '').replace(/[^0-9+]/g, '');
  const digits = phone.replace(/\D/g, '');
  const mobile = !phone
    ? ''
    : phone.startsWith('+')
      ? phone
      : digits.startsWith('00')
        ? `+${digits.slice(2)}`
        : digits.length === 12 && digits.startsWith('91')
          ? `+${digits}`
          : `${IN_DIAL_CODE}${digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits}`;
  return { name: contact.name?.[0] ?? '', mobile };
}
