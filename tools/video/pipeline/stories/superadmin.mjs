/**
 * SUPER-ADMIN demo (PRIVATE — internal operators only). Desktop 1920×1080.
 * Two browser stages: `operator` (platform super admin, /admin/*) and `owner`
 * (Rajesh Sharma inside Sharma General Store), so every console change is shown
 * next to its effect on the business and its users.
 *
 * Needs a platform user with `is_super_admin = true` (see pipeline/make_operator.sh);
 * the lead approves creating it. Its password is typed into a masked field and
 * never printed, narrated or captioned.
 */
import { newDemoOwner, seedBackground, saveAccount, loadAccount, nextRun, must } from '../seed.mjs';

const choose = async (h, scope, label, option) => {
  const box = scope.getByRole('combobox', { name: label }).first();
  await h.tap((await box.count()) ? box : scope.getByLabel(label).first());
  await h.sleep(400);
  await h.tap(h.page.getByRole('option', { name: option }).first());
};
const onOwner = async (h, path, settle = 1800) => { h.camera('owner'); await h.goto(path, settle); };
const onOperator = async (h, path) => { h.camera('operator'); if (path) await h.goto(path, 1500); };

export const meta = {
  id: 'superadmin',
  profile: 'desktop',
  title: 'YourKhata admin console — operator guide (PRIVATE)',
  stages: ['operator', 'owner'],
  format: 'Landscape 16:9, 1920×1080, H.264 + AAC, burned-in Hinglish captions + SRT. PRIVATE: do not upload publicly.',
  audience: 'Platform operators / support staff of YourKhata only.',
  targetLength: '5–7 min',
  intro: 'YourKhata is one platform where a business keeps its records, bills, stock and collections in one place (live module: Shop & billing). This private guide covers every implemented super-admin capability (PLT-14 / WLB-02 read side): tenant list and detail, plan / entitlement / limit overrides, suspend and activate, consented support access and the support session, partners and health — each shown with its effect on the business and its users.',
  privacy: [
    'Private video. The operator account is a demo super admin created for the recording and deactivated afterwards; its email is shown, its password never (masked field, not narrated).',
    'Only the demo business Sharma General Store is opened. The tenant list is searched to that name so other (e2e test) tenants on the dev DB are not browsed; the overview tiles show counts only.',
    'Reasons typed are demo text. No tokens, cookies or impersonation JWTs appear (headless, no dev tools).',
    'The Health page shows version and email backend (console) — internal, acceptable in a private video.',
  ],
};

export const seedDoc = `Made **off camera** by \`prepare()\`:

| Account | How | Notes |
|---|---|---|
| Operator "Platform Support" (\`support.demo@yourkhata.example\`) | \`pipeline/make_operator.sh\` → Django \`createsuperuser\` (sets \`is_super_admin=True\`) | **Lead approval needed.** Deactivate after recording. |
| Owner Rajesh Sharma, business **Sharma General Store** | \`seed.mjs newDemoOwner('admin')\` + \`seedBackground()\` (same data as the desktop video) | Plan = partner default (**Unlimited**, partner Metis Labs). |
| Staff Vikas | created by the owner via \`POST /members\` | So "Members: 2 of …" is realistic. |

What changes **on camera** (and is reverted in the same video): plan Unlimited → Free with member-limit override 2 → back to plan default; status Active → Suspended → Active; one support-access request allowed and ended.`;

export async function prepare(h) {
  const o = await newDemoOwner('admin', { email: `rajesh.a${nextRun('admin')}@sharmastore.example` });
  h.state.ids = await seedBackground(o.token, {});
  // A staff member so the member count is realistic. The server returns a
  // temporary password once; it is discarded here, never printed.
  await must('POST', '/members', { full_name: 'Vikas', email: `vikas.a${nextRun('admin-staff')}@sharmastore.example`, role: 'staff' }, o.token);
  h.state.owner = loadAccount('admin');
  h.state.operator = loadAccount('operator'); // written by make_operator.sh
  if (!h.state.operator) throw new Error('No operator account: run pipeline/make_operator.sh (lead approval) first.');
  // Owner signed in on the owner stage (off camera).
  h.camera('owner');
  await h.quickLogin(h.state.owner.email, h.state.owner.password);
  h.camera('operator');
}

export const chapters = [
  {
    id: 's00', target: '0:25', title: 'Admin console kya hai', cardOnly: true,
    card: { kicker: 'Private · Operators only', title: 'YourKhata admin console', sub: 'Businesses · Plans · Suspend · Support access · Health' },
    problem: 'Platform chalane waale ko har business ki halat, plan aur support ek jagah chahiye — bina merchant ki privacy tode.',
    feature: 'Super-admin console /admin: sirf is_super_admin users ke liye.',
    benefit: 'Har badlav ki wajah likhi jaati hai aur business ke activity log mein dikhti hai.',
    segments: [
      { id: 's00a', onCard: true, cap: 'Ye video sirf YourKhata ki internal support team ke liye hai. Ise public share mat kijiye.', say: 'यह वीडियो सिर्फ़ यौर खाता की इंटरनल सपोर्ट टीम के लिए है। इसे पब्लिक शेयर मत कीजिए।' },
      { id: 's00p', onCard: true, cap: 'YourKhata ek platform hai, jahan har business apna hisaab, bills, stock aur collections ek jagah rakhta hai. Aaj live module hai Shop & billing.', say: 'यौर खाता एक प्लेटफ़ॉर्म है, जहाँ हर बिज़नेस अपना हिसाब, बिल्स, स्टॉक, और कलेक्शन्स एक जगह रखता है। आज लाइव मॉड्यूल है शॉप एंड बिलिंग।' },
      { id: 's00b', onCard: true, cap: 'Hum dekhenge: businesses ki list, plan aur limit badalna, suspend karna, owner ki ijaazat se support session, partners aur system health.', say: 'हम देखेंगे, बिज़नेसेज़ की लिस्ट, प्लान और लिमिट बदलना, सस्पेंड करना, ओनर की इजाज़त से सपोर्ट सेशन, पार्टनर्स, और सिस्टम हेल्थ।' },
      { id: 's00c', onCard: true, cap: 'Hum operator ka console dikhayenge, aur beech-beech mein owner ki screen par jaakar dekhenge ki badlav ka asar kya hua.', say: 'हम ऑपरेटर का कंसोल दिखाएँगे, और बीच बीच में ओनर की स्क्रीन पर जाकर देखेंगे कि बदलाव का असर क्या हुआ।' },
    ],
  },
  {
    id: 's01', target: '0:50', title: 'Login aur businesses ki list',
    card: { kicker: 'Part 1', title: 'Saare businesses, ek list', sub: 'Search · status tiles · usage' },
    problem: 'Merchant phone karta hai — "mera account" — aur operator ko turant uska business dhoondhna hai.',
    feature: 'Admin console → Businesses: status tiles, search by name, GSTIN, owner email or id; plan · partner, usage, last activity.',
    benefit: 'Sekundon mein sahi business; kaun active, kaun suspended, ek nazar mein.',
    steps: ['Login as the operator (masked password)', 'Open /admin → Businesses', 'Tiles: Businesses, Active, Suspended, Pending deletion, Partners', 'Search by the owner email (blurred on screen)', 'Open Sharma General Store'],
    setup: async (h) => {
      // Other (test / earlier-take) businesses on the dev DB stay blurred until the
      // search narrows the list to the demo business (installed before first paint).
      await h.page.addInitScript(() => {
        if (sessionStorage.getItem('__yk_blurlist') === '0') return;
        const add = () => { if (!document.documentElement || document.getElementById('__yk_blurlist')) return; const st = document.createElement('style'); st.id = '__yk_blurlist'; st.textContent = 'main table tbody, main [role=rowgroup]:not(:first-child), main [data-testid*=tenant-row]{filter:blur(10px)!important}'; document.documentElement.appendChild(st); };
        if (document.documentElement) add(); document.addEventListener('DOMContentLoaded', add);
      });
      await h.goto('/login', 1200);
    },
    segments: [
      { id: 's01a', cap: 'Operator apne super-admin account se login karta hai. Ye console sirf unhi logon ko dikhta hai jinke account par super-admin flag laga ho.', say: 'ऑपरेटर अपने सुपर एडमिन अकाउंट से लॉगिन करता है। यह कंसोल सिर्फ़ उन्हीं लोगों को दिखता है, जिनके अकाउंट पर सुपर एडमिन फ़्लैग लगा हो।',
        act: async (h) => {
          await h.type(h.loc('input[type="email"]'), h.state.operator.email, { delay: 40 });
          await h.type(h.loc('input[type="password"]'), h.state.operator.password, { delay: 40 });
          await h.tap(h.loc('button[type="submit"]'));
          await h.page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
          await h.goto('/admin/tenants', 1800);
        } },
      { id: 's01b', cap: 'Upar tiles batati hain kitne businesses hain, kitne active, kitne suspended, aur kitne delete hone waale.', say: 'ऊपर टाइल्स बताती हैं कितने बिज़नेसेज़ हैं, कितने एक्टिव, कितने सस्पेंडेड, और कितने डिलीट होने वाले।',
        act: async (h) => { await h.hover(h.text('Businesses by status').or(h.text(/Active/)).first(), 1500); } },
      { id: 's01c', cap: 'Search mein naam, GSTIN, owner ka email ya id — kuch bhi likhiye. Hum owner ke email se dhoondhte hain (video mein email chhupaya gaya hai).', say: 'सर्च में नाम, जी एस टी आई एन, ओनर का ईमेल, या आई डी, कुछ भी लिखिए। हम ओनर के ईमेल से ढूँढते हैं।',
        act: async (h) => {
          await h.type(h.page.getByRole('searchbox', { name: 'Search businesses' }).or(h.ph('e.g. Ramesh Traders or 27AAPFU0939F1ZV')).first(), h.state.owner.email, { delay: 60 });
          await h.sleep(2000);
          // exactly one business matches now: lift the blur
          await h.page.evaluate(() => { sessionStorage.setItem('__yk_blurlist', '0'); document.getElementById('__yk_blurlist')?.remove(); });
          await h.sleep(800);
        } },
      { id: 's01d', cap: 'Har line mein plan, partner, kitne members aur parties, aur aakhri activity. Business kholte hain.', say: 'हर लाइन में प्लान, पार्टनर, कितने मेंबर्स और पार्टीज़, और आख़िरी एक्टिविटी। बिज़नेस खोलते हैं।',
        act: async (h) => { await h.tap(h.page.getByRole('button', { name: /Open Sharma General Store/ }).or(h.page.getByRole('link', { name: /Sharma General Store/ })).first()); await h.sleep(1800); } },
    ],
  },
  {
    id: 's02', target: '0:40', title: 'Business ki detail',
    card: { kicker: 'Part 2', title: 'Ek business, poori tasveer', sub: 'Profile · plan · limits · modules · owners · activity' },
    problem: 'Support ko samajhna hai ki business kis plan par hai, limit kahan tak pahunchi, aur haal mein kya hua.',
    feature: 'Tenant detail: Profile (status, owners, GSTIN, partner), Plan with member / storage usage, Modules, Support access, Recent activity.',
    benefit: 'Bina merchant ka data khole, sahi jaankari.',
    steps: ['Profile card', 'Plan: Unlimited · Members 2 of unlimited', 'Modules', 'Support access: none', 'Recent activity'],
    segments: [
      { id: 's02a', cap: 'Profile mein status, owner, GSTIN aur partner. Plan card mein members aur storage ka use, limit ke saamne.', say: 'प्रोफ़ाइल में स्टेटस, ओनर, जी एस टी आई एन, और पार्टनर। प्लान कार्ड में मेंबर्स और स्टोरेज का यूज़, लिमिट के सामने।',
        act: async (h) => { await h.hover(h.text('Profile')); await h.hover(h.text(/Plan:/)); await h.hover(h.text(/Members:/)); } },
      { id: 's02b', cap: 'Modules batate hain business mein kya-kya chalu hai. Neeche "Recent activity" — aur dhyan dijiye, yahan customers ya bills nahi dikhte.', say: 'मॉड्यूल्स बताते हैं बिज़नेस में क्या क्या चालू है। नीचे रीसेंट एक्टिविटी। और ध्यान दीजिए, यहाँ कस्टमर्स या बिल्स नहीं दिखते।',
        act: async (h) => { await h.hover(h.text('Modules')); await h.scroll(400, 1200); await h.hover(h.text('Recent activity')); await h.top(); } },
    ],
  },
  {
    id: 's03', target: '1:10', title: 'Plan aur limit override',
    card: { kicker: 'Part 3', title: 'Plan, entitlement aur limits', sub: 'Plan badliye · member limit override · wajah zaroori' },
    problem: 'Merchant ko zyada staff chahiye, ya plan badalna hai — aur ye badlav turant lagu hona chahiye.',
    feature: 'Plan & status dialog: Plan, Member limit override, Storage override (MB), Reason (required, min 5 chars) → Save changes; logged in the business\'s activity log.',
    benefit: 'Limit turant lagti hai; owner ko Settings → Plan mein naya plan dikhta hai, aur limit par pahunchne par saaf message.',
    steps: ['Plan & status', 'Plan → Free; Member limit override 2', 'Reason → Save changes', 'Owner: Settings → Plan shows Free, Members 2 of 2', 'Owner: Team → Add member → "Plan limit reached"', 'Operator: clear override, plan back to Unlimited'],
    segments: [
      { id: 's03a', cap: '"Plan & status" kholiye. Plan ko Free karte hain, aur member limit override 2 rakhte hain.', say: 'प्लान एंड स्टेटस खोलिए। प्लान को फ़्री करते हैं, और मेंबर लिमिट ओवरराइड दो रखते हैं।',
        act: async (h) => {
          await h.tap(h.btn(/Plan & status/));
          await h.sleep(900);
          const d = h.dialog();
          await choose(h, d, /^Plan$/, /^Free/);
          await h.type(d.getByLabel(/Member limit override/).first(), '2', { delay: 150 });
        } },
      { id: 's03b', cap: 'Har badlav ke saath wajah likhna zaroori hai. Save changes — ye business ke activity log mein bhi jaata hai.', say: 'हर बदलाव के साथ वजह लिखना ज़रूरी है। सेव चेंजेस। यह बिज़नेस के एक्टिविटी लॉग में भी जाता है।',
        act: async (h) => {
          const d = h.dialog();
          await h.type(d.getByPlaceholder('e.g. Owner reported a wrong balance on 3 Sep'), 'Demo: moving to Free plan, 2 members');
          await h.tap(d.getByRole('button', { name: /Save changes/ }));
          await h.sleep(2000);
        } },
      { id: 's03c', cap: 'Ab owner ki screen. Settings mein "Your plan" par Free plan, aur members 2 mein se 2 — limit poori.', say: 'अब ओनर की स्क्रीन। सेटिंग्स में योर प्लान पर फ़्री प्लान, और मेंबर्स दो में से दो। लिमिट पूरी।',
        act: async (h) => { await onOwner(h, '/settings/plan'); await h.hover(h.text(/of 2|2 of 2|Limit reached/).first(), 1500); } },
      { id: 's03d', cap: 'Owner teesra member jodne ki koshish karta hai. "Create login" dabate hi saaf message aata hai ki plan ki limit poori ho gayi hai.', say: 'ओनर तीसरा मेंबर जोड़ने की कोशिश करता है। क्रिएट लॉगिन दबाते ही साफ़ मैसेज आता है कि प्लान की लिमिट पूरी हो गई है।',
        act: async (h) => {
          await h.goto('/settings/team', 1500);
          await h.tap(h.btn(/Add member/));
          const d = h.dialog();
          await h.type(d.getByPlaceholder('Enter their full name'), 'Pooja', { delay: 60 });
          await h.type(d.getByPlaceholder('name@example.com'), `pooja.limit${Date.now() % 10000}@sharmastore.example`, { delay: 25 });
          await h.tap(d.getByRole('button', { name: /Create login/ }));
          await h.hardWait(1500);
          await h.expectText(/limit/i, 'plan limit message');
          await h.sleep(1800);
          await h.page.keyboard.press('Escape').catch(() => {});
        } },
      { id: 's03e', cap: 'Wapas console mein override hata kar plan Unlimited kar dete hain. Owner ke liye limit turant khul jaati hai.', say: 'वापस कंसोल में ओवरराइड हटा कर प्लान अनलिमिटेड कर देते हैं। ओनर के लिए लिमिट तुरंत खुल जाती है।',
        act: async (h) => {
          await onOperator(h);
          await h.tap(h.btn(/Plan & status/));
          const d = h.dialog();
          await choose(h, d, /^Plan$/, /^Unlimited/);
          await d.getByLabel(/Member limit override/).first().fill('');
          await h.type(d.getByPlaceholder('e.g. Owner reported a wrong balance on 3 Sep'), 'Demo: back to Unlimited');
          await h.tap(d.getByRole('button', { name: /Save changes/ }));
          await h.sleep(1800);
        } },
    ],
  },
  {
    id: 's04', target: '0:55', title: 'Suspend aur activate',
    card: { kicker: 'Part 4', title: 'Suspend aur activate', sub: 'Business band · data surakshit · wapas chalu' },
    problem: 'Kabhi business ko turant rokna padta hai — payment dispute, misuse ki shikayat — bina data mitaaye.',
    feature: 'Plan & status → Status: Suspended (reason required) → owner and staff cannot open the business; → Active restores it. Nothing is deleted.',
    benefit: 'Turant rok, pura data surakshit, ek click mein wapas.',
    steps: ['Plan & status → Status Suspended → reason → Save changes', 'Owner reloads → business unavailable ("This business is suspended. Contact support.")', 'Operator → Status Active → Save changes', 'Owner reloads → works, data intact'],
    segments: [
      { id: 's04a', cap: 'Status ko Suspended kijiye, wajah likhiye, Save changes.', say: 'स्टेटस को सस्पेंडेड कीजिए, वजह लिखिए, सेव चेंजेस।',
        act: async (h) => {
          await h.tap(h.btn(/Plan & status/));
          const d = h.dialog();
          await choose(h, d, /^Status$/, /^Suspended$/);
          await h.type(d.getByPlaceholder('e.g. Owner reported a wrong balance on 3 Sep'), 'Demo: suspension walkthrough');
          await h.tap(d.getByRole('button', { name: /Save changes/ }));
          await h.sleep(1800);
        } },
      { id: 's04b', cap: 'Owner ki taraf refresh kijiye: dashboard ka data ab load nahi hota, screen par error aata hai — business band hai. Data mita nahi hai, sirf band hai.', say: 'ओनर की तरफ़ रिफ़्रेश कीजिए। डैशबोर्ड का डेटा अब लोड नहीं होता, स्क्रीन पर एरर आता है। बिज़नेस बंद है। डेटा मिटा नहीं है, सिर्फ़ बंद है।',
        act: async (h) => { await onOwner(h, '/dashboard', 2500); await h.sleep(1500); } },
      { id: 's04c', cap: 'Console mein status wapas Active. Owner refresh karta hai — sab kuch pehle jaisa, ek bhi entry kam nahi.', say: 'कंसोल में स्टेटस वापस एक्टिव। ओनर रिफ़्रेश करता है। सब कुछ पहले जैसा, एक भी एंट्री कम नहीं।',
        act: async (h) => {
          await onOperator(h);
          await h.tap(h.btn(/Plan & status/));
          const d = h.dialog();
          await choose(h, d, /^Status$/, /^Active$/);
          await h.type(d.getByPlaceholder('e.g. Owner reported a wrong balance on 3 Sep'), 'Demo: reactivated');
          await h.tap(d.getByRole('button', { name: /Save changes/ }));
          await h.sleep(1500);
          await onOwner(h, '/dashboard', 2500);
        } },
    ],
  },
  {
    id: 's05', target: '1:20', title: 'Owner ki ijaazat se support session',
    card: { kicker: 'Part 5', title: 'Support access — owner ki ijaazat se', sub: 'Request · Allow for 24 hours · Enter business · End session' },
    problem: 'Merchant kehta hai "balance galat dikh raha hai". Support ko andar dekhna hai — par merchant ki ijaazat ke bina kabhi nahi.',
    feature: 'Request access (reason) → owners are notified → owner allows for 24 hours in Settings → Your data → operator Enter business (reason) → support session (max 60 min) with a banner; sensitive actions blocked; owner can end access any time; everything in the activity log.',
    benefit: 'Samasya jaldi hal, aur merchant ka bharosa bana rehta hai.',
    steps: ['Operator: Request access → reason → Send request', 'Owner: bell notification → Settings → Your data → Support access → Allow for 24 hours', 'Operator: Enter business → reason → banner "Support session — … acting in Sharma General Store"', 'Team → Add member is disabled (view-only session)', 'End session', 'Owner: Activity log shows the support session; End access now'],
    segments: [
      { id: 's05a', cap: 'Pehle "Request access" — wajah likhiye aur Send request. Bina owner ki ijaazat ke "Enter business" chalta hi nahi.', say: 'पहले रिक्वेस्ट एक्सेस। वजह लिखिए, और सेंड रिक्वेस्ट। बिना ओनर की इजाज़त के, एंटर बिज़नेस चलता ही नहीं।',
        act: async (h) => {
          await onOperator(h);
          await h.tap(h.btn(/^Request access/));
          const d = h.dialog();
          await h.type(d.getByPlaceholder('e.g. Owner reported a wrong balance on 3 Sep'), 'Owner reported a wrong balance for Suresh Kumar');
          await h.tap(d.getByRole('button', { name: /Send request/ }));
          await h.sleep(1500);
          await h.hover(h.text('Waiting for owner'), 1000);
        } },
      { id: 's05b', cap: 'Owner ko app mein notification milta hai. Settings, Your data, Support access mein request dikhti hai — "Allow for 24 hours".', say: 'ओनर को ऐप में नोटिफ़िकेशन मिलता है। सेटिंग्स, योर डेटा, सपोर्ट एक्सेस में रिक्वेस्ट दिखती है। अलाउ फ़ॉर ट्वेंटी फ़ोर आवर्स।',
        act: async (h) => {
          await onOwner(h, '/dashboard', 1500);
          const bell = h.page.getByRole('button', { name: /notification/i }).first();
          if (await bell.count()) { await h.tap(bell); await h.sleep(1500); await h.page.keyboard.press('Escape').catch(() => {}); }
          await h.goto('/settings/data', 1800);
          await h.scrollTo(h.text('Support access'));
          await h.tap(h.btn(/Allow for 24 hours/));
          await h.sleep(1500);
        } },
      { id: 's05c', cap: 'Ab operator "Enter business" dabata hai, phir se wajah likhta hai. Session zyada se zyada 60 minute ka hota hai.', say: 'अब ऑपरेटर एंटर बिज़नेस दबाता है, फिर से वजह लिखता है। सेशन ज़्यादा से ज़्यादा साठ मिनट का होता है।',
        act: async (h) => {
          await onOperator(h);
          await h.page.reload(); await h.sleep(1800);
          await h.tap(h.btn(/^Enter business/));
          const d = h.dialog();
          await h.type(d.getByPlaceholder('e.g. Owner reported a wrong balance on 3 Sep'), 'Checking Suresh Kumar balance');
          await h.tap(d.getByRole('button', { name: /Enter business/ }));
          await h.page.waitForURL((u) => !u.pathname.startsWith('/admin'), { timeout: 20000 }).catch(() => {});
          await h.sleep(2500);
        } },
      { id: 's05d', cap: 'Upar banner hamesha dikhata hai ki ye support session hai, kiska, aur kab khatam hoga. Operator khata dekh kar problem samajh sakta hai.', say: 'ऊपर बैनर हमेशा दिखाता है कि यह सपोर्ट सेशन है, किसका, और कब ख़त्म होगा। ऑपरेटर खाता देख कर समस्या समझ सकता है।',
        act: async (h) => { await h.hover(h.text(/Support session/), 1500); await h.goto('/parties', 1800); } },
      { id: 's05e', cap: 'Ye session sirf dekhne ke liye hai — "view only". Operator koi entry ya setting nahi badal sakta; jaise Team mein "Add member" band hai.', say: 'यह सेशन सिर्फ़ देखने के लिए है, व्यू ओन्ली। ऑपरेटर कोई एंट्री या सेटिंग नहीं बदल सकता। जैसे टीम में ऐड मेंबर बंद है।',
        act: async (h) => {
          await h.goto('/settings/team', 1500);
          await h.hover(h.text(/view only/), 1200);
          await h.hover(h.btn(/Add member/), 1500);
        } },
      { id: 's05f', cap: 'Kaam ho gaya to banner se "End session". Operator wapas apne console mein.', say: 'काम हो गया, तो बैनर से एंड सेशन। ऑपरेटर वापस अपने कंसोल में।',
        act: async (h) => { await h.tap(h.btn(/^End session/)); await h.sleep(2500); } },
      { id: 's05g', cap: 'Owner ke activity log mein support session ka poora record hai. Aur owner kabhi bhi "End access now" se ijaazat wapas le sakta hai.', say: 'ओनर के एक्टिविटी लॉग में सपोर्ट सेशन का पूरा रिकॉर्ड है। और ओनर कभी भी एंड एक्सेस नाउ से इजाज़त वापस ले सकता है।',
        act: async (h) => {
          await onOwner(h, '/settings/activity', 1800);
          await h.hover(h.text(/Support/).first(), 1200);
          await h.goto('/settings/data', 1500);
          await h.scrollTo(h.text('Support access'));
          const end = h.btn(/End access now/);
          if (await end.count()) await h.tap(end);
          await h.sleep(1200);
        } },
    ],
  },
  {
    id: 's06', target: '0:45', title: 'Partners aur health',
    card: { kicker: 'Part 6', title: 'Partners aur system health', sub: 'Default plan · database · scheduler · jobs' },
    problem: 'Kaunsa partner kitne businesses laata hai, aur kya system theek chal raha hai?',
    feature: 'Partners: default plan and business count (edited in the platform admin). Health: database latency, storage, scheduler heartbeat, background jobs (queued, running, failed 24 h), version; refreshes every 30 s.',
    benefit: 'Problem merchant se pehle operator ko dikh jaati hai.',
    steps: ['Console → Partners', 'Console → Health: Database · Storage · Scheduler · Background jobs · Refresh'],
    segments: [
      { id: 's06a', cap: 'Partners mein har partner ka default plan aur uske businesses ki ginti. Naye business ko partner ka default plan milta hai.', say: 'पार्टनर्स में हर पार्टनर का डिफ़ॉल्ट प्लान, और उसके बिज़नेसेज़ की गिनती। नए बिज़नेस को पार्टनर का डिफ़ॉल्ट प्लान मिलता है।',
        act: async (h) => { await onOperator(h, '/admin/partners'); await h.hover(h.text('Default plan'), 1200); } },
      { id: 's06b', cap: 'Health page par database, storage, scheduler aur jobs ki queue — har 30 second mein refresh. Is demo server par job runner band hai, isliye Scheduler "Problem" dikha raha hai — aisi gadbad yahin sabse pehle dikhti hai.', say: 'हेल्थ पेज पर डेटाबेस, स्टोरेज, शेड्यूलर, और जॉब्स की क्यू। हर तीस सेकंड में रिफ़्रेश। इस डेमो सर्वर पर जॉब रनर बंद है, इसलिए शेड्यूलर प्रॉब्लम दिखा रहा है। ऐसी गड़बड़ यहीं सबसे पहले दिखती है।',
        act: async (h) => { await h.goto('/admin/health', 1800); await h.hover(h.text('Database')); await h.hover(h.text('Scheduler')); await h.hover(h.text('Queued')); } },
    ],
  },
  {
    id: 's07', target: '0:25', title: 'Niyam yaad rakhiye', cardOnly: true,
    card: { kicker: 'Private · Operators only', title: 'Teen niyam', sub: 'Wajah likhiye · ijaazat ke bina andar nahi · kaam khatam, session khatam' },
    problem: '', feature: '', benefit: 'Merchant ka bharosa hi platform ki asli poonji hai.',
    segments: [
      { id: 's07a', onCard: true, cap: 'Teen niyam: har badlav ki wajah likhiye; owner ki ijaazat ke bina kabhi andar mat jaaiye; aur kaam khatam hote hi session band kijiye.', say: 'तीन नियम। हर बदलाव की वजह लिखिए। ओनर की इजाज़त के बिना कभी अंदर मत जाइए। और काम ख़त्म होते ही सेशन बंद कीजिए।' },
      { id: 's07c', onCard: true, cap: 'Lending & collections, Library, Gym & fitness aur Hotel & stays modules planned hain — ye abhi console ya app mein nahi hain.', say: 'लेंडिंग एंड कलेक्शन्स, लाइब्रेरी, जिम एंड फ़िटनेस, और होटल एंड स्टेज़ मॉड्यूल्स प्लान्ड हैं। ये अभी कंसोल या ऐप में नहीं हैं।' },
      { id: 's07b', onCard: true, cap: 'Ye sab business ke activity log mein hamesha ke liye dikhta hai. Dhanyavaad.', say: 'यह सब बिज़नेस के एक्टिविटी लॉग में हमेशा के लिए दिखता है। धन्यवाद।' },
    ],
  },
];
