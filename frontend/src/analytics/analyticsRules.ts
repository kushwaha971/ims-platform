import { ROUTES } from 'src/routes';

/**
 * Where product analytics may run, and what it may be told — the RULES, kept
 * apart from the library so they can be tested without loading it and so the
 * app shell imports a few hundred bytes rather than the SDK.
 *
 * DEC-017 (owner, 11 Oct 2026): PostHog, for analytics and feedback. Three
 * rules bound it, and each exists because this is a ledger:
 *
 * 1. **Never on a page a merchant's customer opens.** The shared bill
 *    (`/d/<token>`), the pay page and the reading room's door check-in are
 *    opened by people who are not our users and agreed to nothing. Canon:
 *    nothing a merchant's customer receives names the product — that includes
 *    not reporting their visit to a third party.
 * 2. **Never on a URL that carries a credential.** Those same pages, the
 *    password-reset link and the invitation link all have a token in the PATH,
 *    and a page view records the address. Analytics that logged them would be
 *    a copy of every share link and reset token, held by somebody else.
 * 3. **No names, numbers or amounts.** A khata screen is a list of who owes
 *    what. The person is known to analytics by their account id only, and what
 *    is on the screen is masked at the source (`posthogClient.ts`).
 */
const NEVER_PREFIXES: readonly string[] = [
  ROUTES.PUBLIC_DOCUMENT,
  ROUTES.PUBLIC_PAY,
  ROUTES.SELF_CHECKIN,
  ROUTES.RESET_PASSWORD,
  ROUTES.SET_PASSWORD,
  ROUTES.ACCEPT_INVITE,
];

/** May analytics see this address at all? A prefix match on a whole segment. */
export const analyticsAllowedOn = (pathname: string): boolean =>
  !NEVER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export interface AnalyticsPerson {
  /** The account's id — the ONLY thing that says who this is. */
  readonly id: string;
  readonly locale: string;
}

export interface AnalyticsBusiness {
  readonly id: string;
  readonly role: string | null;
  /** App codes the business runs, e.g. `['library']`. */
  readonly apps: readonly string[];
}

/**
 * What is said about a signed-in person: nothing that could name them or their
 * business. No name, no mobile number, no email, no business name.
 */
export const personProperties = (
  person: AnalyticsPerson,
  business: AnalyticsBusiness | null
): Record<string, string | readonly string[]> => ({
  locale: person.locale,
  ...(business
    ? { business_id: business.id, role: business.role ?? 'unknown', apps: [...business.apps] }
    : {}),
});

/**
 * An address as analytics may hold it: the page, without its query or hash.
 * `/customers?q=Ramesh` is a customer's name typed into a search box, and
 * `?next=` can carry a share link; the SDK attaches the full address to every
 * event it sends (clicks, identify, not only page views), so the address is
 * cut HERE, on the way out, rather than at each call.
 */
export const withoutQuery = (value: string): string => value.replace(/[?#].*$/, '');

const scrubValues = (bag: Record<string, unknown> | undefined): void => {
  if (!bag) return;
  for (const [key, value] of Object.entries(bag)) {
    if (typeof value === 'string' && /^https?:\/\//.test(value)) bag[key] = withoutQuery(value);
  }
};

export interface OutgoingEvent {
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/**
 * The last gate before an event leaves (`before_send`). Every address in it
 * loses its query, and an event raised on an address analytics may not see is
 * dropped — the host already stops the SDK there, and this holds if it is late.
 */
export const scrubEvent = <T extends OutgoingEvent>(
  event: T | null,
  pathname: string
): T | null => {
  if (!event || !analyticsAllowedOn(pathname)) return null;
  scrubValues(event.properties);
  scrubValues(event.$set);
  scrubValues(event.$set_once);
  scrubValues(event.properties?.$set as Record<string, unknown> | undefined);
  scrubValues(event.properties?.$set_once as Record<string, unknown> | undefined);
  return event;
};
