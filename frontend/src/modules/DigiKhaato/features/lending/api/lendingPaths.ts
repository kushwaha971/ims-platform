/** The lending endpoints, kept in the feature (the library's reason, F03). */
const seg = (id: string): string => encodeURIComponent(id);

export const LENDING_PATHS = {
  PREVIEW: '/lending/loans/preview',
  LOANS: '/lending/loans',
  LOAN: (id: string) => `/lending/loans/${seg(id)}`,
  COLLECTIONS: (id: string) => `/lending/loans/${seg(id)}/collections`,
  COLLECTION_PREVIEW: (id: string) => `/lending/loans/${seg(id)}/collections/preview`,
  VISITS: (id: string) => `/lending/loans/${seg(id)}/visits`,
  // LEN-09 — one instalment's late-fee suggestion and waivable parts; adding and waiving.
  DUE: (id: string, dueId: string) => `/lending/loans/${seg(id)}/dues/${seg(dueId)}`,
  LATE_FEES: (id: string) => `/lending/loans/${seg(id)}/late-fees`,
  WAIVERS: (id: string) => `/lending/loans/${seg(id)}/waivers`,
  WRITE_OFF: (id: string) => `/lending/loans/${seg(id)}/write-off`,
  CANCEL: (id: string) => `/lending/loans/${seg(id)}/cancel`,
  VOID: (id: string) => `/lending/collections/${seg(id)}/void`,
  MESSAGE: (id: string, kind: string) => `/lending/loans/${seg(id)}/message/${seg(kind)}`,
  REMINDERS: '/lending/reminders',
  TODAY: '/lending/today',
  BORROWERS: '/lending/borrowers',
  BORROWER_COLLECTIONS: (id: string) => `/lending/borrowers/${seg(id)}/collections`,
  BORROWER_COLLECTION_PREVIEW: (id: string) => `/lending/borrowers/${seg(id)}/collections/preview`,
  ROUTES: '/lending/routes',
  ROUTE: (id: string) => `/lending/routes/${seg(id)}`,
} as const;
