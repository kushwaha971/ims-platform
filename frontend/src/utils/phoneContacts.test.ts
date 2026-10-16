import { phoneContactsSupported, pickPhoneContact } from './phoneContacts';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'contacts');
  Reflect.deleteProperty(window, 'isSecureContext');
});
const setup = (result: { name?: string[]; tel?: string[] }[]) => {
  const select = jest.fn().mockResolvedValue(result);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select } });
  return select;
};
it('does not request contacts on unsupported browsers', () =>
  expect(phoneContactsSupported()).toBe(false));
it('requests one selected name and number and normalizes an Indian number', async () => {
  const select = setup([{ name: ['Asha'], tel: ['098765 43210'] }]);
  expect(await pickPhoneContact()).toEqual({ name: 'Asha', mobile: '+919876543210' });
  expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: false });
});
it('preserves international numbers', async () => {
  setup([{ name: ['Alex'], tel: ['+44 7911 123456'] }]);
  expect(await pickPhoneContact()).toEqual({ name: 'Alex', mobile: '+447911123456' });
});
it('does not fill fields when no contact was selected', async () => {
  setup([]);
  expect(await pickPhoneContact()).toBeNull();
});
it('tidies the name a phone book stores (PTY-07 FR-5)', async () => {
  // Phone books keep stray spaces and doubled gaps; the form would save them.
  setup([{ name: ['  Ramesh   Kirana  '], tel: ['9876543210'] }]);
  expect(await pickPhoneContact()).toEqual({ name: 'Ramesh Kirana', mobile: '+919876543210' });
});
