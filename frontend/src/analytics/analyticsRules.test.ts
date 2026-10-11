import { analyticsAllowedOn, personProperties, scrubEvent } from './analyticsRules';

/**
 * DEC-017 — the rules that bound product analytics. Each test names the leak
 * it prevents; none of them needs the SDK.
 */
describe('where analytics may run', () => {
  it.each(['/', '/login', '/signup', '/dashboard', '/customers', '/library', '/lending/loans'])(
    'runs on the ordinary address %s',
    (path) => expect(analyticsAllowedOn(path)).toBe(true)
  );

  it.each([
    ['/d/2f9c1a7e', "a customer's copy of a bill"],
    ['/pay/8b1d', 'the pay page a payer opens'],
    ['/in/room-7', "the reading room's door check-in"],
    ['/reset-password/tok_123', 'a password-reset link'],
    ['/accept-invite/inv_456', 'an invitation link'],
    ['/set-password', 'the forced password change'],
  ])('never runs on %s — %s', (path) => {
    // These are opened by people who are not our users, or carry a credential
    // in the path. A page view records the address: analytics here would be a
    // copy of every share link and reset token, held by a third party.
    expect(analyticsAllowedOn(path)).toBe(false);
  });

  it('matches whole segments, so /dashboard and /inventory are not mistaken for /d and /in', () => {
    expect(analyticsAllowedOn('/dashboard')).toBe(true);
    expect(analyticsAllowedOn('/inventory')).toBe(true);
    expect(analyticsAllowedOn('/payments')).toBe(true);
  });
});

describe('what analytics is told about a person', () => {
  it('carries the business id, the role and the apps, and nothing that names anybody', () => {
    const properties = personProperties(
      { id: 'u1', locale: 'hi' },
      { id: 't1', role: 'owner', apps: ['library'] }
    );
    expect(properties).toEqual({
      locale: 'hi',
      business_id: 't1',
      role: 'owner',
      apps: ['library'],
    });
    // The type allows no name, mobile, email or business name; this pins the
    // KEYS so adding one is a decision somebody has to make in this file.
    expect(Object.keys(properties).sort()).toEqual(['apps', 'business_id', 'locale', 'role']);
  });

  it('says only the language of somebody with no business yet', () => {
    expect(personProperties({ id: 'u1', locale: 'en' }, null)).toEqual({ locale: 'en' });
  });
});

describe('what leaves with every event', () => {
  it('cuts the query and the hash off every address, wherever the SDK put it', () => {
    // Found on the wire by `e2e/analytics.mjs`: the page view was clean, and
    // the click and the identify beside it carried `/customers?q=Ramesh` —
    // a customer's name, typed into a search box.
    const event = scrubEvent(
      {
        properties: {
          $current_url: 'https://yourkhata.com/customers?q=Ramesh#top',
          $referrer: 'https://yourkhata.com/login?next=/d/tok_1',
          $pathname: '/customers',
          $set: { $current_url: 'https://yourkhata.com/customers?q=Ramesh' },
          $set_once: { $initial_current_url: 'https://yourkhata.com/?utm=x' },
        },
        $set: { $current_url: 'https://yourkhata.com/customers?q=Ramesh' },
      },
      '/customers'
    );
    expect(JSON.stringify(event)).not.toMatch(/Ramesh|tok_1|utm=/);
    expect(event?.properties?.$current_url).toBe('https://yourkhata.com/customers');
    expect(event?.properties?.$pathname).toBe('/customers');
  });

  it('drops an event raised on an address analytics may not see', () => {
    expect(scrubEvent({ properties: {} }, '/d/2f9c1a7e')).toBeNull();
    expect(scrubEvent(null, '/customers')).toBeNull();
  });
});
