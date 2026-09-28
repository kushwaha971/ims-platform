import { redirect } from 'next/navigation';

import { ROUTES } from 'src/routes';

/** PLT-14 — the console opens on the business list (FRD §6's flow starts there). */
export default function AdminIndexPage(): never {
  redirect(ROUTES.ADMIN_TENANTS);
}
