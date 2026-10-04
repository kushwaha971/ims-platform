/**
 * F03 — the library's endpoints, kept in the feature rather than in core's
 * `API_PATHS`: that object ships to every route, and the Wave B gate holds the
 * shell unchanged for a module most businesses never switch on.
 */
const seg = (id: string): string => encodeURIComponent(id);

export const LIBRARY_PATHS = {
  TITLES: '/library/titles',
  TITLE: (id: string) => `/library/titles/${seg(id)}`,
  TITLE_COPIES: (id: string) => `/library/titles/${seg(id)}/copies`,
  TITLE_ARCHIVE: (id: string) => `/library/titles/${seg(id)}/archive`,
  TITLE_RESTORE: (id: string) => `/library/titles/${seg(id)}/restore`,
  COPIES: '/library/copies',
  COPY: (id: string) => `/library/copies/${seg(id)}`,
  COPY_WITHDRAW: (id: string) => `/library/copies/${seg(id)}/withdraw`,
  COPY_REPAIR: (id: string) => `/library/copies/${seg(id)}/repair`,
  COPY_BACK_TO_SHELF: (id: string) => `/library/copies/${seg(id)}/back-to-shelf`,
  LOOKUP: '/library/lookup',
  CATEGORIES: '/library/categories',
  CATEGORY: (id: string) => `/library/categories/${seg(id)}`,
  CATEGORY_MERGE: (id: string) => `/library/categories/${seg(id)}/merge`,
  LOCATIONS: '/library/locations',
  LOCATION: (id: string) => `/library/locations/${seg(id)}`,
  SETTINGS: '/library/settings',
  MEMBERS: '/library/members',
  MEMBER: (id: string) => `/library/members/${seg(id)}`,
  MEMBER_ACTION: (id: string, action: string) => `/library/members/${seg(id)}/${action}`,
  MEMBERSHIP_TYPES: '/library/membership-types',
  LOANS: '/library/loans',
  LOAN_ACTION: (id: string, action: string) => `/library/loans/${seg(id)}/${action}`,
  RETURNS: '/library/returns',
  CHARGES: '/library/charges',
  CHARGE_ACTION: (id: string, action: string) => `/library/charges/${seg(id)}/${action}`,
  SETTINGS_NUMBERING: '/library/settings/numbering',
} as const;
