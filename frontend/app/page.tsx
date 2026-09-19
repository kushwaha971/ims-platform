import { redirect } from 'next/navigation';

import { ROUTES } from 'src/routes';

/**
 * The front door. There is no content at `/` — an authenticated merchant belongs
 * on the dashboard, and `proxy.ts` bounces them from there to `/login` if they
 * carry no session cookie. Redirecting here rather than in the proxy keeps the
 * session guard in exactly one place (Part 19 §19.7.3).
 */
export default function RootPage(): never {
  redirect(ROUTES.DASHBOARD);
}
