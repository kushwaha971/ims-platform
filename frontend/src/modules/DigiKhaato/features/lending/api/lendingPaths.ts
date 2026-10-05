/** The lending endpoints, kept in the feature (the library's reason, F03). */
const seg = (id: string): string => encodeURIComponent(id);

export const LENDING_PATHS = {
  PREVIEW: '/lending/loans/preview',
  LOANS: '/lending/loans',
  LOAN: (id: string) => `/lending/loans/${seg(id)}`,
  COLLECTIONS: (id: string) => `/lending/loans/${seg(id)}/collections`,
  COLLECTION_PREVIEW: (id: string) => `/lending/loans/${seg(id)}/collections/preview`,
  VISITS: (id: string) => `/lending/loans/${seg(id)}/visits`,
  VOID: (id: string) => `/lending/collections/${seg(id)}/void`,
  TODAY: '/lending/today',
  BORROWERS: '/lending/borrowers',
  ROUTES: '/lending/routes',
  ROUTE: (id: string) => `/lending/routes/${seg(id)}`,
} as const;
