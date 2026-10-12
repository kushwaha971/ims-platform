# YourKhata search and organic growth audit

Reviewed 12 October 2026. Scope: public Next.js routes, metadata, crawl/index controls, landing content and module registry, Django API headers, production environment handling and Google account setup. This is a launch audit, not a penetration test, a guarantee of indexing, or a measured keyword-volume study.

## Positioning and audience

YourKhata is a modular business-management platform, rather than a product restricted to three industries. Its shared foundation covers people, money, payments, documents, reports, roles and language. Public solution pages describe shipped capabilities; future modules join the same registry only after their actual workflows are reviewed. Gym/hotel remain outside the present public solution registry.

Primary launch audiences: small retail businesses tracking bills, stock and dues; independent libraries/study spaces tracking memberships, seats, attendance and fees; businesses maintaining lawful borrower/loan/repayment records. Secondary audience: staff and collection teams that need role-appropriate access and separate business books. These are product-fit hypotheses from implemented workflows, not surveyed market-size findings.

Daily problems: duplicated notebooks/spreadsheets, uncertain outstanding balances, fees or repayments disconnected from people, and switching between tools for related records. A useful differentiation hypothesis is a common operating model across separate business books with Hindi/English application support. Do not claim that competitors cannot provide these features or that YourKhata is cheaper without a current, like-for-like comparison.

## Competitor evidence and implications

| Product | Primary-source observation | Implication for YourKhata |
| --- | --- | --- |
| Khatabook | Public site presents digital ledger, invoicing, inventory and loans | Ledger alone is not a distinctive position; show connected workflows and boundaries clearly |
| Vyapar | Public business-management pages combine billing, accounting, inventory and reporting | Compete on specific usability/workflow evidence, not an unsupported all-in-one claim |
| myBillBook | Public inventory page connects billing with stock updates | Explain how a sale, stock and customer balance relate, using a real demo |
| Libib | Pro materials describe circulation and patron management | Separate reading-space membership/seat workflows from conventional book circulation intent |
| Loandisk | Features describe borrower records, loans, repayments and integrations | Explain record/collection workflows; do not imply YourKhata lends money or grants legal authority |

Sources checked: https://khatabook.com/ ; https://vyaparapp.in/business-management-software ; https://mybillbook.in/inventory-management-software ; https://www.libib.com/pricing ; https://www.loandisk.com/features.html . Prices, market share and comparative ease of use were not established.

## Technical findings and changes

| Priority | Finding | Resolution / status |
| --- | --- | --- |
| P0 | Auth routes could inherit indexable root metadata; login/signup appeared in sitemap | Auth group now has noindex metadata; sitemap excludes these conversion flows |
| P0 | Django API responses bypass Next headers | Django security middleware adds X-Robots-Tag to API responses, including errors |
| P1 | Public search surface was largely one homepage with module anchors | Added solutions hub and dedicated, self-canonical pages with unique titles/descriptions, visible FAQs and internal links |
| P1 | Homepage title/badge defined platform by today's module list | Broad modular-business positioning; current capabilities remain examples, not future-feature promises |
| P1 | A new public page can be redirected by client auth bootstrap | Solutions prefix is explicitly public; private route guards remain in place |
| P1 | New public content needs structured context | WebPage, BreadcrumbList and matching FAQPage JSON-LD on solution routes; existing homepage Organization/WebSite/SoftwareApplication/VideoObject retained |
| P2 | Cookie language switching is not a separate indexable language URL | No invented hreflang pairs. New editorial pages are explicitly English; review Hindi versions at stable distinct URLs before adding hreflang |
| P2 | No field-performance evidence yet | PageSpeed API returned 429; no score or Core Web Vitals pass is claimed |
| P2 | Analytics property visible was unrelated btu-shaadi | Separate YourKhata setup required. Property removal was attempted at user's request but Google denied access; user subsequently asked to keep both, so nothing deleted |

Existing strengths retained: canonical origin comes from SITE_URL, preview images have dimensions, private document/share/pay/self-check-in pages have noindex/no-store controls, public media caching exists, important homepage FAQ answers are in HTML, and no fake reviews or ratings are emitted. Robots is not authentication and cannot guarantee an unlinked private URL will never be mentioned in search; access controls remain authoritative.

Public routes added:
- /solutions
- /solutions/shop-billing
- /solutions/library-management
- /solutions/lending-collections

Unknown solution slugs return 404. Root cookies keep routes server-rendered; do not claim that these routes became fully static merely because generateStaticParams is supplied.

## GEO approach

Use readable descriptions, explicit audiences, workflow steps and answer-first FAQs. Structured data mirrors visible text. Preserve crawl access for public content and access controls for private data. Do not create AI-citation claims, special AI schema, or a large set of thin keyword pages.

llms.txt is deferred: no developer-documentation corpus currently needs an additional navigation index, and it is not a requirement for Google AI search. Re-evaluate if public product/API documentation grows. Google states that ordinary SEO fundamentals apply to AI Overviews/AI Mode and no special AI text file is required: https://developers.google.com/search/docs/appearance/ai-features .

Multilingual guidance: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites . Crawl/index distinction: https://developers.google.com/search/docs/crawling-indexing/robots/intro .

## Google and environment status

Owner account: kushwahaakash971@gmail.com (confirmed by user).
Search Console: domain property created; DNS TXT publicly observed; verification and initial sitemap submission completed by user. No crawl, ranking or indexed-page count inferred from submission.
PostHog: production build arguments and public environment were synchronized in the preceding deployment. Retain it as existing product analytics. Never pass Meta/DB/backend credentials as NEXT_PUBLIC values.
GA4: dedicated YourKhata account 411596467, property 558470285, stream 16110681484 and measurement ID G-CZ46THB8CD created. Canonical stream URL corrected to https://yourkhata.com; enhanced measurement disabled. Search Console domain link confirmed as LINK CREATED. Production collection still needs live verification after deployment. GTM is unnecessary unless a real tag-management need emerges; avoid installing both direct and GTM copies of the same tag.
Canonical public origin remains https://yourkhata.com. Local API/proxy targets remain local; Railway uses same-origin /api/v1. No valid secret or production origin should be replaced with example values.

## Keyword and content opportunities

These are prioritized query hypotheses, without invented search volume or difficulty scores. Validate using Search Console impressions and query data after crawling, user interviews, and a keyword tool if one becomes available.

| Priority | Query cluster | Intent / destination |
| --- | --- | --- |
| P1 | business management software for small business; modular business management software | Platform evaluation; homepage/solutions hub |
| P1 | shop billing and inventory software; GST bills and customer dues | Workflow evaluation; shop solution |
| P1 | study library management software; reading room seat and fee management | Specific operating need; library solution |
| P1 | loan collection record software; borrower repayment tracker | Record-management need; lending solution |
| P2 | how to track customer dues; sales vs collections; low stock record | Educational guide linked to relevant solution |
| P2 | library membership fee register; attendance and seat allocation | Practical guides and downloadable examples after review |
| P2 | daily loan collection register; match repayment to borrower | Practical recordkeeping, without legal/credit advice |
| P2 | दुकान का हिसाब कैसे रखें; लाइब्रेरी फीस रिकॉर्ड; ग्राहक का बकाया | Reviewed Hindi guides at distinct URLs |
| P3 | YourKhata alternatives/comparisons | Publish only after hands-on, dated feature/pricing validation |

Do not target all possible industries at once. Search intent for a study space differs from an academic library, and loan-record software differs from borrowing money. Keep these distinctions explicit.

## 30/60/90-day plan

Days 1–30: finish GA4 setup, validate indexing/404/canonical/noindex behavior, submit updated sitemap, inspect launch URLs in Search Console, record baseline impressions/clicks/conversions, interview 3–5 users in each initial audience, and publish one real workflow walkthrough per solution. Verify public claims against shipped screens. Check mobile performance when PageSpeed access is available.

Days 31–60: use actual search queries to improve page headings/FAQs, publish 4–6 original problem-solving guides, add reviewed Hindi equivalents with reciprocal hreflang, record real customer examples with consent, and connect each guide to one relevant solution. Measure landing visit → signup start → verified signup → first meaningful business action.

Days 61–90: expand only clusters showing useful impressions or activated users, publish evidence-based comparisons where justified, improve weak conversion steps from observations, and add solution pages for newly launched modules through the same registry. Review inactive pages rather than generating thin programmatic pages.

Success measures: valid indexed public URLs, organic impressions/clicks by query cluster, relevant signup and activation conversion, returning organic users and first-user feedback. AI referrals are an additional observable channel, not a promised ranking outcome.

## Validation record

105 focused frontend SEO/landing/public-route tests passed after updating the approved positioning assertion. Four backend architecture/security-header tests passed. TypeScript and production Next build passed. Existing test-console act warning is not a new runtime failure. Live visual and HTTP verification, final bundle budgets, production deployment and Google service completion are recorded separately when completed; do not infer them from local builds.


## Additional implementation and evidence

Public acquisition pages now skip the root session API fetch. Private/auth routes still bootstrap sessions; tests cover both. GA4 runs only on home/solutions routes, strips query strings and reduces referrers to origins, disables Google signals/ad-personalization signals and disables the tag on public-component exit. Enhanced measurement is disabled to avoid a second page-view owner and automatic form collection. Public page views are implemented; completed-signup conversion instrumentation is a follow-up, not an accomplished claim.

Final focused GA4/public-bootstrap/SEO/landing run: 106 tests passed in five suites. Earlier public-route suite also passed. Backend security-header suite: four passed. TypeScript, changed-file ESLint, i18n consistency, production build and bundle budgets passed. Local HTTP probes confirmed four public 200 responses with one H1 and self-canonical tags, unknown solution 404, auth noindex header and seven sitemap entries. PageSpeed API returned 429. Google external Rich Results validation and field Core Web Vitals remain separate from local JSON-LD validity.

### Main affected files

| File | Responsibility |
| --- | --- |
| frontend/app/solutions/page.tsx | Public solutions hub |
| frontend/app/solutions/[slug]/page.tsx | Reviewed solution routing and metadata; unknown slugs 404 |
| frontend/src/modules/DigiKhaato/features/landing/config/solutions.ts | Extensible capability/content registry |
| frontend/src/modules/DigiKhaato/features/landing/components/SolutionsPage.tsx | Semantic copy, breadcrumbs, visible FAQs and internal links |
| frontend/src/modules/DigiKhaato/features/landing/utils/solutionMetadata.ts | Self-canonical and social metadata |
| frontend/src/modules/DigiKhaato/features/landing/config/seoAssets.ts | Shared metadata assets without importing unrelated module copy |
| frontend/src/utils/seo.ts | Sitemap editorial surface |
| frontend/app/(auth)/layout.tsx and frontend/next.config.js | Auth/private noindex metadata and HTTP headers |
| backend/apps/common/middleware.py | API noindex response header |
| frontend/src/routes.ts | Public marketing-route classification |
| frontend/src/modules/DigiKhaato/features/auth/components/SessionBootstrap.tsx | Marketing/API independence |
| frontend/src/analytics/GooglePublicTracker.tsx | Controlled GA4 acquisition tracking |
| frontend/locales/catalogues/landing.en.json and landing.hi.json | Broad platform positioning and footer solution link |
| Dockerfile, frontend/src/constants.ts, .env.example | Public GA4 build configuration; no private credentials |

Do not paste the ignored local env files into interview materials or public repositories. The GA4 measurement ID and PostHog project key are public browser configuration; Meta and database credentials are not.
