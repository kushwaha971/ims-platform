# SEO setup — what is done, and the steps only the owner can do

11 Oct 2026. The on-page work is in the code and was checked on the built site.
What is left needs a Google or Bing login, or the DNS panel, so it is a
checklist for the owner. `docs/LANDING-AND-DEMO-REPORT.md` has the page-level
audit and the Lighthouse figures.

## 1. Already in place (checked on the build and on yourkhata.com)

| Thing | Where | State |
| --- | --- | --- |
| `robots.txt` | `frontend/app/robots.ts`, lists in `src/utils/seo.ts` | Live. Allows `/`, `/legal/`, `/login`, `/signup`; disallows the app, the console, the API, and every page with a token (`/d/`, `/pay/`, `/in/`, reset, invite). Names the sitemap. |
| `sitemap.xml` | `frontend/app/sitemap.ts` | Live. Five URLs: home, sign-up, login, terms, privacy. |
| Canonical URL | every public page | `https://yourkhata.com…`, from `NEXT_PUBLIC_SITE_URL`. |
| Title and description | per page (`app/page.tsx`, `config/seo.ts`) | Unique per page; the home page names Shop, Library and Lending. |
| Open Graph and Twitter card | home page | Title, description, 1200×630 image (`/brand/yourkhata-og.png`), `en_IN`. |
| Structured data (JSON-LD) | `utils/landingJsonLd.ts` | `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `VideoObject` (with the YouTube embed address and the transcript). No invented ratings or reviews. |
| `noindex` on private pages | page meta, `X-Robots-Tag` in `next.config.js`, nginx | A customer's bill is never indexed. |
| One `h1`, every image has `alt`, `lang` set | landing page | Checked. |
| The demo film's words | landing page HTML | Chapters and both transcripts are text in the page. |
| HTTPS and HSTS | hosting | `http://` redirects to `https://`; HSTS is sent. |
| Ownership tags | `app/layout.tsx` → `siteVerification()` | **New.** Written when `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_BING_SITE_VERIFICATION` are set. |

## 2. Google Search Console — about ten minutes

1. Open <https://search.google.com/search-console> and sign in with the Google
   account that should own the site.
2. **Add property.** Two kinds; either works:
   - **Domain** (`yourkhata.com`) — covers `www`, `http` and `https` in one.
     Google shows a **TXT record**; add it at your domain registrar's DNS panel.
     Nothing in the code changes. This is the better one.
   - **URL prefix** (`https://yourkhata.com`) — choose the **HTML tag** method.
     Google shows `<meta name="google-site-verification" content="…">`. Copy the
     `content` code (or the whole tag) into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
     where the site is built, redeploy, then press **Verify**.
3. **Sitemaps** (left menu) → enter `sitemap.xml` → **Submit**.
4. **URL inspection** → paste `https://yourkhata.com/` → **Request indexing**.
   Repeat for `/signup`.
5. Come back in two or three days: **Pages** shows what was indexed and why
   anything was not; **Enhancements** shows whether the FAQ and video data were
   read.

## 3. Bing Webmaster Tools — five minutes

Open <https://www.bing.com/webmasters>, sign in, and choose **Import from Google
Search Console**; it copies the property and the sitemap. If you verify by tag
instead, put the code in `NEXT_PUBLIC_BING_SITE_VERIFICATION` and redeploy. Bing
also feeds DuckDuckGo and ChatGPT's search.

## 4. Deploy the current `dev`

The site that is live today is older than `dev`. On 11 Oct 2026 its home page
still said "library and gym members … and room bookings", which the landing page
no longer says (Gym and Hotel are hidden). Search engines index what is live, so
deploy before asking for indexing.

## 5. `www.yourkhata.com`

From here, `https://www.yourkhata.com/` did not load (502) while
`https://yourkhata.com/` did. People type `www`, and links to it lose their
value if it does not answer. Add `www.yourkhata.com` as a domain at the host
(Railway) with a redirect to `https://yourkhata.com`, or add the DNS record it
asks for. Check it from your own browser first; this was seen from one network.

## 6. Worth doing, in this order

1. **Google Business Profile**, if there is an office address to list.
2. **YouTube:** the two demo films — link `https://yourkhata.com` in each
   description, and upload the caption files (`frontend/public/media/landing/*.vtt`).
3. **A page per module** (`/shop`, `/library`, `/lending`). The home page has to
   rank for three different kinds of search at once; a page each, with its own
   title and its own FAQ, is the single biggest thing left. Not built.
4. **A Hindi URL.** The language is a cookie, so there is one URL per page and
   search engines only ever see the English one. `/hi` with `hreflang` would let
   the Hindi page be found by Hindi searches. Not built.
5. **Links from outside:** listings on Indian SaaS directories and a few honest
   mentions matter more than anything else on this list once the above is done.

## 7. What not to do

No fabricated reviews, ratings, user counts or "trusted by" lines, in the page
or in structured data. The tests refuse them (`src/tests/seo.test.tsx`), and
Google penalises review markup it cannot verify.
