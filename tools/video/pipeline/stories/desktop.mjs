/**
 * DESKTOP demo (public, YouTube 16:9) — 1440×810 CSS @4/3 → 1920×1080 frames,
 * visible cursor (arrow + halo) that glides to each target and ripples on click.
 * A step-by-step guide: every chapter is problem → feature → steps → result.
 * Only VERIFIED features (HANDOFF §5/§6/§8b). No super-admin screens here.
 */
import { loginToken, newDemoOwner, seedBackground, saveAccount, loadAccount, nextRun, api, must } from '../seed.mjs';

const nav = async (h, name) => {
  await h.tap(h.page.getByRole('navigation').getByRole('link', { name, exact: true }).first()
    .or(h.page.getByRole('link', { name, exact: true }).first()));
  await h.sleep(1200);
};

export const meta = {
  id: 'desktop',
  profile: 'desktop',
  title: 'YourKhata desktop guide — ek platform: Shop & billing step by step',
  stages: ['main'],
  format: 'Landscape 16:9, 1920×1080 (browser 1440×810 CSS at 4/3 scale, i.e. text 1.33× larger than a plain 1080p screen), H.264 + AAC, burned-in Hinglish captions + SRT, YouTube chapters',
  audience: 'Shop owners, accountants and staff who work on a laptop/desktop (public: clients/users, YouTube). Non-technical.',
  targetLength: '10–14 min',
  intro: 'YourKhata is one platform where a business keeps its records, bills, stock and collections in one place. This is a step-by-step guide to its live module, Shop & billing, running Sharma General Store on a computer. Planned modules are named once, as planned, in the closing card (no UI, no dates). Each chapter opens with the business problem, then shows the exact clicks, then the result.',
  privacy: [
    'Demo owner made through the API just before recording (fictional Rajesh Sharma, rajesh.d<n>@sharmastore.example). Password typed into the masked field only.',
    'Staff temporary password (Team chapter) is blurred by the masker ([data-testid=credentials-password], copy-message); the take is rejected if the recorder logs a leak.',
    'Share links: the WhatsApp pop-up is captured and closed; the customer page is opened in the same chrome-less page, so the /d/<token> URL never appears.',
    'No super-admin console, account, "Support" banner or admin credentials in this video.',
  ],
};

export const seedDoc = `Made **off camera** by \`prepare()\` (\`pipeline/seed.mjs\`): owner Rajesh Sharma with a finished business **Sharma General Store** (Retail shop, Maharashtra 27, Regular GST with an invented checksum-valid GSTIN, 14 Mahatma Phule Road, Pune 411002, UPI sharmastore.demo@example), then \`seedBackground(skip: Ramesh Traders)\`: the same items, customers (Suresh Kumar, Anita General Store, Mohan Lal, Priya Sweets), supplier **Gupta Wholesale**, khata entries, a fortnight of bills, one payment and three expenses as in the mobile video.

Created **on camera**: customer **Ramesh Traders** with his khata entries and a wrong entry that is corrected; the GST bill for Ramesh (Basmati Rice 5kg ×2, Toor Dal 1kg ×3); an estimate for Priya Sweets converted to a bill; a return (credit note) of 1 Toor Dal from Suresh; a payment from Suresh; a purchase bill from Gupta Wholesale (Sugar 1kg ×50 @ ₹40) and its payment; one expense; a CSV import of three customers (\`pipeline/assets/customers.csv\`: Kiran Provision, Deepak Dairy, Farida Bakers); staff member Vikas.`;

export async function prepare(h) {
  // The dev stack runs no job runner; the CSV import (d12) needs one. Start a
  // bounded runner restricted to import jobs for the length of the take.
  if (!h.rec.opts.dry || process.env.RUN_IMPORTS === '1') {
    const { spawn } = await import('node:child_process');
    const r = spawn('python', ['manage.py', 'run_scheduler', '--interval', '2', '--max-runtime', '2400', '--job-types', 'imports.validate', 'imports.commit'],
      { cwd: '/home/claude/repo/backend', stdio: 'ignore', detached: false });
    process.on('exit', () => { try { r.kill(); } catch {} });
  }
  const o = await newDemoOwner('desktop', { email: `rajesh.d${nextRun('desktop')}@sharmastore.example` });
  h.state.ids = await seedBackground(o.token, { skip: ['Ramesh Traders'] });
  saveAccount('desktop', { ...loadAccount('desktop'), ids: h.state.ids });
  h.state.acct = loadAccount('desktop');
  h.state.staffEmail = `vikas.d${nextRun('desktop-staff')}@sharmastore.example`;
}

export const chapters = [
  {
    id: 'd00', target: '0:25', title: 'Intro — YourKhata kya hai', cardOnly: true,
    card: { kicker: 'YourKhata', title: 'Ek platform, saara hisaab — computer par', sub: 'Shop & billing: Udhaar · Stock · GST bill · Payments · Reports' },
    problem: 'Kaagaz ki khata-book, alag bill book aur stock register — teeno milaana mushkil.',
    feature: 'YourKhata: ek platform jahan business apna hisaab, bills, stock aur collections ek jagah rakhta hai. Aaj live module: Shop & billing (khata, stock, GST billing, kharid, kharche, reports).',
    benefit: 'Har rupaye ka hisaab, har samay sahi.',
    segments: [
      { id: 'd00a', onCard: true, cap: 'Namaste! YourKhata ek platform hai, jahan business apna saara hisaab — bills, stock, payments aur collections — ek hi jagah rakhta hai.', say: 'नमस्ते! यौर खाता एक प्लेटफ़ॉर्म है, जहाँ बिज़नेस अपना सारा हिसाब, बिल्स, स्टॉक, पेमेंट्स, और कलेक्शन्स, एक ही जगह रखता है।' },
      { id: 'd00c', onCard: true, cap: 'Is guide mein hum step by step Shop & billing module dekhenge, jo aaj live hai — computer par.', say: 'इस गाइड में हम स्टेप बाय स्टेप शॉप एंड बिलिंग मॉड्यूल देखेंगे, जो आज लाइव है, कंप्यूटर पर।' },
      { id: 'd00b', onCard: true, cap: 'Hamari demo dukaan hai Sharma General Store. Chapters neeche description mein hain — jo kaam chahiye, seedha wahan jaaiye.', say: 'हमारी डेमो दुकान है शर्मा जनरल स्टोर। चैप्टर्स नीचे डिस्क्रिप्शन में हैं। जो काम चाहिए, सीधा वहाँ जाइए।' },
    ],
  },
  {
    id: 'd01', target: '0:50', title: 'Login aur dashboard',
    card: { kicker: 'Chapter 1', title: 'Login aur dashboard', sub: 'Subah ki pehli nazar' },
    problem: 'Din shuru karte hi pata nahi hota ki kitna udhaar baaki hai, kitna dena hai, aur kya khatam ho raha hai.',
    feature: 'Dashboard tiles: To collect, To pay, Due today, Overdue, Today\'s sales, Cash in hand, Low stock; sidebar menu.',
    benefit: 'Ek screen par poori dukaan ki halat; har tile click karke list khulti hai.',
    steps: ['Login: email + password (masked)', 'Dashboard tiles', 'Recent activity · Who owes most · Running low', 'Sidebar: Daily / Business / Insight / Account', 'Top search: customers and suppliers'],
    setup: async (h) => { await h.goto('/login', 1200); },
    // --only=<later chapters>: sign in off camera instead
    skipSetup: async (h) => { await h.quickLogin(h.state.acct.email, h.state.acct.password); },
    segments: [
      { id: 'd01a', cap: 'Apna email aur password daal kar Log in kijiye. Password hamesha dots mein chhupa rehta hai.', say: 'अपना ईमेल और पासवर्ड डाल कर लॉग इन कीजिए। पासवर्ड हमेशा डॉट्स में छुपा रहता है।',
        act: async (h) => {
          await h.type(h.loc('input[type="email"]'), h.state.acct.email, { delay: 40 });
          await h.type(h.loc('input[type="password"]'), h.state.acct.password, { delay: 40 });
          await h.tap(h.loc('button[type="submit"]'));
          await h.page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
          if (!/dashboard/.test(h.page.url())) await h.goto('/dashboard', 1500); else await h.sleep(1800);
        } },
      { id: 'd01b', cap: 'Ye dashboard hai. "To collect" batata hai ki customers se kitna lena hai, aur "To pay" ki suppliers ko kitna dena hai.', say: 'यह डैशबोर्ड है। टू कलेक्ट बताता है कि कस्टमर्स से कितना लेना है, और टू पे, कि सप्लायर्स को कितना देना है।',
        act: async (h) => { await h.hover(h.btn(/^To collect/)); await h.hover(h.btn(/^To pay/)); } },
      { id: 'd01c', cap: 'Aaj ki sale, galle mein cash aur low stock bhi yahin hai. Kisi bhi tile par click kijiye — poori list khul jaati hai.', say: 'आज की सेल, गल्ले में कैश, और लो स्टॉक भी यहीं है। किसी भी टाइल पर क्लिक कीजिए, पूरी लिस्ट खुल जाती है।',
        act: async (h) => { await h.hover(h.btn(/^Today's sales/)); await h.hover(h.btn(/^Cash in hand/)); await h.hover(h.btn(/^Low stock/)); } },
      { id: 'd01d', cap: 'Neeche Recent activity, sabse zyada udhaar wale customers, aur khatam hota maal dikhta hai.', say: 'नीचे रीसेंट एक्टिविटी, सबसे ज़्यादा उधार वाले कस्टमर्स, और ख़त्म होता माल दिखता है।',
        act: async (h) => { await h.scroll(420, 1400); await h.hover(h.text('Who owes most')); await h.top(); } },
      { id: 'd01e', cap: 'Baayein menu mein roz ke kaam, business, reports aur settings hain. Upar search se kisi bhi customer ya supplier tak turant pahunchiye.', say: 'बाएँ मेन्यू में रोज़ के काम, बिज़नेस, रिपोर्ट्स, और सेटिंग्स हैं। ऊपर सर्च से किसी भी कस्टमर या सप्लायर तक तुरंत पहुँचिए।',
        act: async (h) => { await h.hover(h.link('Customers')); await h.hover(h.link('Bills')); await h.hover(h.link('Reports')); await h.hover(h.ph('Search customers and suppliers')); } },
    ],
  },
  {
    id: 'd02', target: '0:45', title: 'Business profile aur branding',
    card: { kicker: 'Chapter 2', title: 'Bill par sahi jaankari', sub: 'Business profile · Branding' },
    problem: 'Bill par GSTIN, pata ya UPI galat ho to customer aur CA dono pareshaan.',
    feature: 'Settings → Business profile (naam, GST, pata, bank, UPI) with bill header preview; Branding (logo, rang, bill ki lines).',
    benefit: 'Ek baar bhariye — har bill, statement aur receipt par apne aap.',
    steps: ['Sidebar → Settings', 'Business profile: GSTIN, address, UPI — Bill header preview', 'Branding: brand colour, Save changes'],
    segments: [
      { id: 'd02a', cap: 'Settings mein "Business profile" kholiye. Dukaan ka naam, GSTIN, pata aur UPI yahan ek hi baar bharna hota hai.', say: 'सेटिंग्स में बिज़नेस प्रोफ़ाइल खोलिए। दुकान का नाम, जी एस टी आई एन, पता, और यू पी आई, यहाँ एक ही बार भरना होता है।',
        act: async (h) => { await nav(h, 'Settings'); await h.tap(h.text('Business profile')); await h.sleep(1500); } },
      { id: 'd02b', cap: 'Side mein "Bill header preview" dikhata hai ki aapke bill ke upar kya chhapega.', say: 'साइड में बिल हेडर प्रीव्यू दिखाता है कि आपके बिल के ऊपर क्या छपेगा।',
        act: async (h) => { await h.hover(h.text('Bill header preview'), 1600); } },
      { id: 'd02c', cap: 'Branding mein apna logo aur rang chuniye — bill aur customer page usi rang mein dikhenge.', say: 'ब्रांडिंग में अपना लोगो और रंग चुनिए। बिल और कस्टमर पेज उसी रंग में दिखेंगे।',
        act: async (h) => {
          await h.goto('/settings/branding', 1500);
          await h.tap(h.btn(/Use #0F766E/));
          await h.sleep(900);
          await h.tap(h.btn(/Use #4A47D6/));
        } },
    ],
  },
  {
    id: 'd03', target: '1:20', title: 'Customer aur udhaar khata',
    card: { kicker: 'Chapter 3', title: 'Udhaar khata', sub: 'Customer jodiye · You gave / You got · galti sudhaariye' },
    problem: 'Kaagaz par udhaar mein galti hoti hai, aur "maine itna nahi liya tha" wali behas hoti hai.',
    feature: 'Add party; khata with You gave / You got; running balance; wrong entry → Correct (the original stays visible, struck through).',
    benefit: 'Har entry tareekh aur note ke saath; galti sudhaarne par bhi record saaf rehta hai.',
    steps: ['Customers → Add party', 'Name Ramesh Traders, mobile 98000 00101 → Save party', 'You gave ₹1,200 "Monthly ration" → Save', 'You got ₹5,000 (typo) → Save', 'Entry ⋯ → Correct → ₹500, reason → Save', 'Balance ₹700; "Show corrections" reveals the audit trail'],
    setup: async (h) => { await h.goto('/parties', 1500); },
    // --only=<later chapters>: Ramesh Traders exists with the corrected khata (₹700)
    skipSetup: async (h) => {
      const tok = await loginToken(h.state.acct.email, h.state.acct.password);
      const p = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, state_code: '27', mobile: '9800000101' }, tok);
      await must('POST', `/parties/${p.id}/ledger-entries`, { direction: 'debit', amount: '1200.00', entry_date: new Date().toISOString().slice(0, 10), note: 'Monthly ration' }, tok);
      await must('POST', `/parties/${p.id}/ledger-entries`, { direction: 'credit', amount: '500.00', entry_date: new Date().toISOString().slice(0, 10), payment_mode: 'cash' }, tok);
    },
    segments: [
      { id: 'd03a', cap: 'Customers list mein har customer ka balance dikhta hai. Upar ke chips se sirf "Owes me" ya "I owe them" filter kijiye.', say: 'कस्टमर्स लिस्ट में हर कस्टमर का बैलेंस दिखता है। ऊपर के चिप्स से सिर्फ़ ओज़ मी, या आई ओ देम, फ़िल्टर कीजिए।',
        act: async (h) => { await h.tap(h.btn(/^Owes me/)); await h.sleep(1200); await h.tap(h.btn(/^Owes me/)); } },
      { id: 'd03b', cap: 'Naya customer: "Add party" dabaiye, naam Ramesh Traders aur mobile number likhiye, phir Save party.', say: 'नया कस्टमर। ऐड पार्टी दबाइए, नाम रमेश ट्रेडर्स, और मोबाइल नंबर लिखिए, फिर सेव पार्टी।',
        act: async (h) => {
          await h.tap(h.btn(/^Add party/));
          await h.type(h.ph('e.g. Ramesh Traders'), 'Ramesh Traders');
          await h.type(h.ph('10-digit mobile number'), '9800000101', { delay: 80 });
          await h.tap(h.btn(/Save party/));
          await h.sleep(2000);
          const open = h.page.getByRole('link', { name: /Ramesh Traders/ }).or(h.btn(/Open Ramesh Traders/)).first();
          if (!/\/parties\/[0-9a-f-]{8,}/.test(h.page.url()) && (await open.count())) await h.tap(open);
          await h.sleep(1200);
        } },
      { id: 'd03c', cap: 'Ramesh ji ₹1,200 ka ration udhaar le gaye. "You gave" dabaiye, amount aur note likhiye, Save.', say: 'रमेश जी बारह सौ रुपये का राशन उधार ले गए। यू गेव दबाइए, अमाउंट और नोट लिखिए, सेव।',
        act: async (h) => {
          await h.tap(h.btn(/^You gave/));
          await h.type(h.dialog().locator('input[name="amount"]'), '1200', { delay: 110 });
          await h.type(h.dialog().locator('input[name="note"]'), 'Monthly ration');
          await h.tap(h.dialog().getByRole('button', { name: /^Save$/ }));
          await h.sleep(1500);
        } },
      { id: 'd03d', cap: 'Unhone ₹500 diye, par jaldi mein hamne ₹5,000 likh diya. Aisi galti roz hoti hai.', say: 'उन्होंने पाँच सौ रुपये दिए, पर जल्दी में हमने पाँच हज़ार लिख दिया। ऐसी ग़लती रोज़ होती है।',
        act: async (h) => {
          await h.tap(h.btn(/^You got/));
          await h.type(h.dialog().locator('input[name="amount"]'), '5000', { delay: 110 });
          await h.tap(h.dialog().getByRole('button', { name: /^Save$/ }));
          await h.sleep(1500);
        } },
      { id: 'd03e', cap: 'Entry ke teen dots se "Correct" chuniye, sahi amount ₹500 aur wajah likhiye. Purani entry mitti nahi — record ke liye kati hui rehti hai.', say: 'एंट्री के तीन डॉट से करेक्ट चुनिए, सही अमाउंट पाँच सौ रुपये और वजह लिखिए। पुरानी एंट्री मिटती नहीं, रिकॉर्ड के लिए कटी हुई रहती है।',
        act: async (h) => {
          await h.tap(h.page.getByRole('button', { name: /More actions for/ }).first());
          await h.tap(h.page.getByRole('menuitem', { name: /Correct/ }).or(h.page.getByRole('button', { name: /^Correct/ })).first());
          await h.sleep(900);
          const d = h.dialog();
          await h.type(d.locator('input[name="amount"]'), '500', { delay: 110 });
          const reason = d.locator('textarea, input[name="reason"]').first();
          if (await reason.count()) await h.type(reason, 'Typed 5000 instead of 500');
          await h.tap(d.getByRole('button', { name: /^Save|Correct/ }).last());
          await h.sleep(1800);
        } },
      { id: 'd03f', cap: 'Result: balance sahi ₹700. "Show corrections" on karne par poori history dikhti hai — kisne, kab, kya badla.', say: 'नतीजा, बैलेंस सही सात सौ रुपये। शो करेक्शन्स ऑन करने पर पूरी हिस्ट्री दिखती है। किसने, कब, क्या बदला।',
        act: async (h) => {
          await h.expectText(/700\.00/, 'balance ₹700');
          const sw = h.page.getByRole('switch', { name: /Show corrections/ }).first();
          if (await sw.count()) { await h.tap(sw); await h.sleep(1500); await h.tap(sw); }
        } },
    ],
  },
  {
    id: 'd04', target: '1:00', title: 'Statement, reminder aur aging',
    card: { kicker: 'Chapter 4', title: 'Udhaar wapas laaiye', sub: 'Statement · WhatsApp reminder · Aging' },
    problem: 'Customer maanta nahi ki itna baaki hai; aur yaad dilana bhool jaate hain.',
    feature: 'Statement with running balance (print / CSV); Send reminder on WhatsApp; Reminders buckets; Aging by 0–30 / 31–60 / 61–90 / 90+ days.',
    benefit: 'Saboot saamne, polite reminder ek click mein, aur pata ki kisko pehle phone karna hai.',
    steps: ['Khata → More actions → Statement', 'Print / Export', 'More actions → Send reminder → WhatsApp', 'Sidebar → Reminders (Due today / Overdue / Upcoming / Sent)', 'Sidebar → Aging'],
    segments: [
      { id: 'd04a', cap: '"Statement" kholiye. Passbook ki tarah har entry aur running balance — isko print kijiye ya customer ko bhejiye.', say: 'स्टेटमेंट खोलिए। पासबुक की तरह हर एंट्री और रनिंग बैलेंस। इसको प्रिंट कीजिए, या कस्टमर को भेजिए।',
        act: async (h) => {
          await h.tap(h.btn(/More actions/));
          await h.tap(h.page.getByRole('menuitem', { name: /^Statement/ }).or(h.page.getByRole('link', { name: /^Statement/ })).or(h.page.getByRole('button', { name: /^Statement/ })).first());
          await h.sleep(1800);
          await h.hover(h.btn(/Print/).or(h.btn(/Export/)).first(), 1000);
          await h.page.goBack(); await h.sleep(1500);
        } },
      { id: 'd04b', cap: '"Send reminder" se ek polite message taiyaar milta hai — naam, baaki rakam aur dukaan ka naam ke saath. WhatsApp par click, aur bhej dijiye.', say: 'सेंड रिमाइंडर से एक पोलाइट मैसेज तैयार मिलता है। नाम, बाक़ी रक़म, और दुकान का नाम के साथ। व्हाट्सऐप पर क्लिक, और भेज दीजिए।',
        act: async (h) => {
          await h.tap(h.btn(/More actions/));
          await h.tap(h.page.getByRole('menuitem', { name: /Send reminder/ }).or(h.page.getByRole('button', { name: /Send reminder/ })).first());
          await h.sleep(1800);
          const wa = h.page.getByRole('button', { name: /WhatsApp/ }).last();
          if (await wa.count()) await h.tap(wa);
          await h.sleep(1000);
          await h.page.keyboard.press('Escape').catch(() => {});
        } },
      { id: 'd04c', cap: 'Reminders page par dikhta hai kiska paisa aaj aana hai, kiska late ho gaya, aur kisko reminder ja chuka hai.', say: 'रिमाइंडर्स पेज पर दिखता है, किसका पैसा आज आना है, किसका लेट हो गया, और किसको रिमाइंडर जा चुका है।',
        act: async (h) => { await nav(h, 'Reminders'); await h.tap(h.page.getByRole('tab', { name: /Overdue/ }).first()); await h.tap(h.page.getByRole('tab', { name: /Sent/ }).first()); } },
      { id: 'd04d', cap: 'Aging report udhaar ko umar ke hisaab se baantti hai. 90 din se purana paisa sabse zyada risk mein hai — wahan pehle phone kijiye.', say: 'एजिंग रिपोर्ट उधार को उम्र के हिसाब से बाँटती है। नब्बे दिन से पुराना पैसा सबसे ज़्यादा रिस्क में है। वहाँ पहले फ़ोन कीजिए।',
        act: async (h) => { await nav(h, 'Aging'); await h.hover(h.text(/61–90 days/)); await h.hover(h.text('Anita General Store')); } },
    ],
  },
  {
    id: 'd05', target: '1:00', title: 'Items aur stock',
    card: { kicker: 'Chapter 5', title: 'Stock ki poori khabar', sub: 'Items · Adjust stock · Low stock · Stock summary' },
    problem: 'Maal khatam hone ka pata tab chalta hai jab customer maang leta hai; toot-phoot ka hisaab nahi rehta.',
    feature: 'Items with price, GST, HSN, reorder point; stock movements; Adjust stock (damage/count difference); Low stock; Stock summary at average cost.',
    benefit: 'Stock aur uski value hamesha sahi; order samay par.',
    steps: ['Sidebar → Items', 'Open Basmati Rice 5kg: stock, average cost, movements', 'Adjust stock → Damage, −2', 'Low stock', 'Stock summary'],
    segments: [
      { id: 'd05a', cap: 'Items mein har cheez ka selling price, GST aur dukaan mein bacha stock dikhta hai. Upar poore stock ki value bhi.', say: 'आइटम्स में हर चीज़ का सेलिंग प्राइस, जी एस टी, और दुकान में बचा स्टॉक दिखता है। ऊपर पूरे स्टॉक की वैल्यू भी।',
        act: async (h) => { await nav(h, 'Items'); await h.hover(h.text('Stock value')); } },
      { id: 'd05b', cap: 'Basmati Rice kholiye. Stock, average cost, aur har aana-jaana — opening, bikri, kharid — ek list mein.', say: 'बासमती राइस खोलिए। स्टॉक, एवरेज कॉस्ट, और हर आना जाना, ओपनिंग, बिक्री, ख़रीद, एक लिस्ट में।',
        act: async (h) => { await h.tap(h.page.getByRole('link', { name: 'Basmati Rice 5kg' }).first()); await h.sleep(1500); await h.hover(h.text('Stock movements')); } },
      { id: 'd05c', cap: 'Do bori bheeg kar kharab ho gayi? "Adjust stock" mein reason Damage chuniye, quantity minus 2, aur Post adjustment.', say: 'दो बोरी भीग कर ख़राब हो गई? एडजस्ट स्टॉक में रीज़न, डैमेज चुनिए, क्वांटिटी माइनस दो, और पोस्ट एडजस्टमेंट।',
        act: async (h) => {
          await h.tap(h.btn(/^Adjust stock/));
          await h.sleep(900);
          const d = h.dialog();
          await h.tap(d.getByRole('combobox', { name: /Reason|Choose a reason/ }).first());
          await h.tap(h.page.getByRole('option', { name: 'Damage' }).first());
          await h.type(d.getByPlaceholder('e.g. Rain damage in godown'), 'Rain damage');
          const qty = d.locator('input[aria-label^="Qty"]').first();
          await h.type(qty, '-2', { delay: 150 });
          await h.tap(d.getByRole('button', { name: /Post adjustment/ }));
          await h.sleep(1800);
        } },
      { id: 'd05d', cap: 'Low stock report batata hai ki kya reorder level se neeche hai — jaise Sugar. Stock summary mein poore maal ki value average cost par milti hai.', say: 'लो स्टॉक रिपोर्ट बताती है कि क्या रीऑर्डर लेवल से नीचे है, जैसे शुगर। स्टॉक समरी में पूरे माल की वैल्यू एवरेज कॉस्ट पर मिलती है।',
        act: async (h) => { await h.goto('/stock/low', 1500); await h.hover(h.text('Sugar 1kg')); await h.goto('/stock/summary', 1500); await h.scroll(300); } },
    ],
  },
  {
    id: 'd06', target: '1:40', title: 'GST bill banaiye',
    card: { kicker: 'Chapter 6', title: 'GST bill — sahi aur tez', sub: 'Items · CGST/SGST apne aap · payment · print · share' },
    problem: 'Haath se GST bill banana dheema hai; tax ka hisaab galat ho sakta hai; stock aur khata alag se update karna padta hai.',
    feature: 'New bill: party, items, rate and GST from the item, CGST+SGST (or IGST) by place of supply; Issue with payment; A4 / 80 mm print; UPI QR; Share on WhatsApp; customer page.',
    benefit: 'Ek click mein sahi GST bill — stock kam, khata mein baaki, customer ke paas link.',
    steps: ['Bills → New bill', 'Party → Ramesh Traders', 'Basmati Rice 5kg × 2, Toor Dal 1kg × 3', 'Totals: Taxable, CGST 2.5%, SGST 2.5%', 'Issue → payment ₹500 Google Pay → Received ₹500 · Issue', 'Print A4 / 80 mm · UPI QR', 'Share on WhatsApp → customer view'],
    segments: [
      { id: 'd06a', cap: 'Bills mein "New bill" dabaiye. Walk-in ke liye seedha items, udhaar customer ke liye "Party" chuniye — Ramesh Traders.', say: 'बिल्स में न्यू बिल दबाइए। वॉक इन के लिए सीधा आइटम्स, उधार कस्टमर के लिए पार्टी चुनिए, रमेश ट्रेडर्स।',
        act: async (h) => {
          await nav(h, 'Bills');
          await h.tap(h.btn(/^New bill/).or(h.link(/^New bill/)).first());
          await h.sleep(1500);
          await h.tap(h.page.getByRole('radio', { name: 'Party' }));
          await h.pick(h.ph('Search by name or mobile'), 'Rame', 'Ramesh Traders');
        } },
      { id: 'd06b', cap: 'Item mein "Basm" likhiye aur Basmati Rice 5kg chuniye, quantity 2. Rate aur GST item se apne aap bhar jaate hain.', say: 'आइटम में बास लिखिए, और बासमती राइस पाँच किलो चुनिए, क्वांटिटी दो। रेट और जी एस टी आइटम से अपने आप भर जाते हैं।',
        act: async (h) => {
          await h.pickItem(1, 'Basm', 'Basmati Rice 5kg', 2);
        } },
      { id: 'd06c', cap: '"Add item" se doosri line — Toor Dal 1kg, quantity 3.', say: 'ऐड आइटम से दूसरी लाइन, तूर दाल एक किलो, क्वांटिटी तीन।',
        act: async (h) => {
          await h.tap(h.btn(/^Add item$/));
          await h.pickItem(2, 'Toor', 'Toor Dal 1kg', 3);
        } },
      { id: 'd06d', cap: 'Totals dekhiye: taxable value, CGST aur SGST alag-alag. Customer doosre state ka hota, to IGST apne aap lagta.', say: 'टोटल्स देखिए। टैक्सेबल वैल्यू, सी जी एस टी, और एस जी एस टी, अलग अलग। कस्टमर दूसरे स्टेट का होता, तो आई जी एस टी अपने आप लगता।',
        act: async (h) => { await h.scrollTo(h.testid('invoice-totals')); await h.hover(h.testid('invoice-grand-total'), 1500); } },
      { id: 'd06e', cap: '"Issue" dabaiye. Ramesh ji abhi ₹500 Google Pay se de rahe hain — amount aur mode chuniye, phir "Received ₹500 · Issue".', say: 'इश्यू दबाइए। रमेश जी अभी पाँच सौ रुपये गूगल पे से दे रहे हैं। अमाउंट और मोड चुनिए, फिर रिसीव्ड पाँच सौ, इश्यू।',
        act: async (h) => {
          await h.tap(h.testid('invoice-issue'));
          await h.sleep(1200);
          await h.type(h.dialog().getByLabel('Amount').first(), '500', { delay: 150 });
          const gp = h.dialog().getByRole('radio', { name: /Google Pay/ }).first();
          if (await gp.count()) await h.tap(gp);
          await h.tap(h.testid('invoice-payment-confirm'));
          await h.sleep(2500);
          const view = h.page.getByRole('link', { name: /View bill/ }).or(h.page.getByRole('button', { name: /View bill/ })).first();
          await view.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
          if (await view.isVisible().catch(() => false)) await h.tap(view);
          await h.sleep(1800);
        } },
      { id: 'd06f', cap: 'Bill taiyaar! Stock kam ho gaya, aur baaki rakam Ramesh ji ke khata mein jud gayi. Print A4 ya 80 mm thermal — dono hain.', say: 'बिल तैयार! स्टॉक कम हो गया, और बाक़ी रक़म रमेश जी के खाते में जुड़ गई। प्रिंट ए फ़ोर, या अस्सी एम एम थर्मल, दोनों हैं।',
        act: async (h) => { await h.hover(h.testid('print-a4-action')); await h.hover(h.testid('print-thermal-action')); } },
      { id: 'd06g', cap: 'Bill par UPI QR chhapta hai — customer scan karke turant pay kar sakta hai, aur rakam shabdon mein bhi likhi hoti hai.', say: 'बिल पर यू पी आई क्यू आर छपता है। कस्टमर स्कैन करके तुरंत पे कर सकता है, और रक़म शब्दों में भी लिखी होती है।',
        act: async (h) => { await h.scrollTo(h.testid('upi-qr')); await h.hover(h.testid('print-words'), 1200); await h.top(); } },
      { id: 'd06h', cap: '"Share on WhatsApp" se bill ka link jaata hai. Customer ko bina app ke aisa page dikhta hai — sirf aapki dukaan ke naam ke saath.', say: 'शेयर ऑन व्हाट्सऐप से बिल का लिंक जाता है। कस्टमर को बिना ऐप के ऐसा पेज दिखता है, सिर्फ़ आपकी दुकान के नाम के साथ।',
        act: async (h) => {
          h.rec.lastPopup = null;
          await h.page.evaluate(() => { window.__yk_lastOpen = null; });
          await h.tap(h.btn(/Share on WhatsApp/));
          await h.lastShare();
          await h.sleep(1500);
          const m = decodeURIComponent(h.rec.lastPopup ?? '').match(/https?:\/\/[^\s]+\/d\/[A-Za-z0-9_-]+/);
          if (!m) throw new Error('share link was not captured');
          h.state.billUrl = h.page.url();
          await h.goto(new URL(m[0]).pathname, 2200);
          await h.scroll(350, 1200);
          await h.page.goto(h.state.billUrl); await h.sleep(1200);
        } },
    ],
  },
  {
    id: 'd07', target: '1:00', title: 'Estimate aur return',
    card: { kicker: 'Chapter 7', title: 'Estimate aur maal wapsi', sub: 'Estimate se bill · Credit note' },
    problem: 'Bade order se pehle customer rate poochta hai; aur kabhi maal wapas aata hai — dono ka hisaab bigadta hai.',
    feature: 'Estimate (Save & send, then Convert to bill); Return items on a bill → credit note that reduces the balance and puts stock back.',
    benefit: 'Quote se bill ek click mein; wapsi ka GST aur stock dono sahi.',
    steps: ['Bills → Estimates → New estimate: Priya Sweets, Sugar 1kg × 10 → Save & send', 'Estimate → Convert to invoice', 'Open Suresh Kumar\'s bill → Return items: Toor Dal 1kg × 1 → credit note'],
    segments: [
      { id: 'd07a', cap: 'Priya Sweets ne das kilo cheeni ka rate poocha. "New estimate" banaiye, item daaliye aur "Save & send".', say: 'प्रिया स्वीट्स ने दस किलो चीनी का रेट पूछा। न्यू एस्टिमेट बनाइए, आइटम डालिए, और सेव एंड सेंड।',
        act: async (h) => {
          await h.goto('/sales/estimates/new', 1500);
          await h.tap(h.page.getByRole('radio', { name: 'Party' }));
          await h.pick(h.ph('Search by name or mobile'), 'Priya', 'Priya Sweets');
          await h.pickItem(1, 'Suga', 'Sugar 1kg', 10);
          await h.tap(h.testid('invoice-issue'));
          await h.sleep(2200);
        } },
      { id: 'd07b', cap: 'Customer maan gaya? Estimate par "Convert to invoice" dabaiye — saari lines naye bill mein aa jaati hain.', say: 'कस्टमर मान गया? एस्टिमेट पर कन्वर्ट टू इनवॉइस दबाइए। सारी लाइन्स नए बिल में आ जाती हैं।',
        act: async (h) => {
          const conv = h.btn(/Convert/);
          await h.tap(conv);
          await h.sleep(1500);
          const confirm = h.dialog().getByRole('button', { name: /Convert|Continue|Issue/ }).last();
          if (await confirm.count()) await h.tap(confirm);
          await h.sleep(2000);
        } },
      { id: 'd07c', cap: 'Suresh ji ek Toor Dal wapas laaye. Unka bill kholiye, "Return items" chuniye aur quantity 1.', say: 'सुरेश जी एक तूर दाल वापस लाए। उनका बिल खोलिए, रिटर्न आइटम्स चुनिए, और क्वांटिटी एक।',
        act: async (h) => {
          await h.goto('/sales/invoices', 1500);
          await h.tap(h.btn(/Open INV\/.* Suresh Kumar/).or(h.page.getByRole('link', { name: /Suresh Kumar/ })).first());
          await h.sleep(1500);
          await h.tap(h.testid('invoice-return'));
          await h.sleep(1800);
          // one "Return qty" box per invoiced line, in bill order: Basmati, Toor Dal
          await h.type(h.page.getByPlaceholder(/^0 to \d+$/).nth(1), '1', { delay: 150 });
        } },
      { id: 'd07d', cap: 'Save karte hi credit note ban jaata hai: Suresh ji ka balance kam, aur Toor Dal wapas stock mein.', say: 'सेव करते ही क्रेडिट नोट बन जाता है। सुरेश जी का बैलेंस कम, और तूर दाल वापस स्टॉक में।',
        act: async (h) => {
          await h.tap(h.btn(/Issue credit note/));
          await h.sleep(1500);
          const c = h.dialog().getByRole('button', { name: /Issue|Confirm|Apply|Save/ }).last();
          if (await c.count()) await h.tap(c);
          await h.sleep(2000);
        } },
    ],
  },
  {
    id: 'd08', target: '0:45', title: 'Payment record kijiye',
    card: { kicker: 'Chapter 8', title: 'Paisa aaya — payment', sub: 'Cash · UPI · bank · receipt' },
    problem: 'Paisa aa gaya par bill "unpaid" hi dikhta raha — customer se galti se dobara maang liya.',
    feature: 'Payments → Record payment: Received/Paid out, party, mode, amount; allocated to the oldest bills; receipt.',
    benefit: 'Bill, khata aur cashbook ek saath update; receipt number ke saath saboot.',
    steps: ['Sidebar → Payments → Record payment', 'Received from Suresh Kumar', 'PhonePe ₹1,000', 'Save payment', 'Receipt RCT/…'],
    segments: [
      { id: 'd08a', cap: 'Payments mein "Record payment" dabaiye. Received chuniye aur customer — Suresh Kumar.', say: 'पेमेंट्स में रिकॉर्ड पेमेंट दबाइए। रिसीव्ड चुनिए, और कस्टमर, सुरेश कुमार।',
        act: async (h) => {
          await nav(h, 'Payments');
          await h.tap(h.btn(/Record payment/));
          await h.sleep(900);
          await h.pick(h.dialog().getByPlaceholder('Search a customer or supplier'), 'Sure', 'Suresh Kumar');
        } },
      { id: 'd08b', cap: 'PhonePe chuniye, amount ₹1,000, aur Save payment.', say: 'फ़ोनपे चुनिए, अमाउंट एक हज़ार रुपये, और सेव पेमेंट।',
        act: async (h) => {
          const d = h.dialog();
          await h.tap(d.getByRole('radio', { name: 'PhonePe' }).first());
          await h.type(d.getByPlaceholder('e.g. 500').first(), '1000', { delay: 130 });
          await h.tap(h.testid('payment-save'));
          await h.sleep(2200);
        } },
      { id: 'd08c', cap: 'Receipt number ban gaya. Pehle baaki bill chukta hota hai; bachi rakam advance ban kar rehti hai. Suresh ji ka khata bhi update ho gaya.', say: 'रसीद नंबर बन गया। पहले बाक़ी बिल चुकता होता है। बची रक़म एडवांस बन कर रहती है। सुरेश जी का खाता भी अपडेट हो गया।',
        act: async (h) => {
          await h.hover(h.text(/RCT\//), 1500);
          const done = h.dialog().getByRole('button', { name: /^Done$/ });
          if (await done.count()) await h.tap(done);
        } },
    ],
  },
  {
    id: 'd09', target: '1:00', title: 'Kharid aur supplier payment',
    card: { kicker: 'Chapter 9', title: 'Supplier se kharid', sub: 'Purchase bill · stock badhta hai · Pay supplier' },
    problem: 'Supplier ke bill file mein pade rehte hain; stock haath se badhana padta hai; kitna dena hai yaad nahi.',
    feature: 'Purchases → New bill (supplier, supplier invoice no., items, cost, GST) → Record; Pay supplier.',
    benefit: 'Stock, average cost aur supplier ka baaki — sab apne aap; input GST report mein.',
    steps: ['Sidebar → Purchases → New bill', 'Supplier Gupta Wholesale, invoice GW-2291', 'Sugar 1kg × 50 @ ₹40 (before GST)', 'Record (paid now → bill Paid)', 'Purchases → Unpaid → older Gupta bill → Pay supplier → Bank'],
    segments: [
      { id: 'd09a', cap: 'Sugar kam tha, to Gupta Wholesale se 50 packet aaye. Purchases mein "New bill", supplier chuniye aur unka bill number likhiye.', say: 'शुगर कम थी, तो गुप्ता होलसेल से पचास पैकेट आए। परचेज़ में न्यू बिल, सप्लायर चुनिए, और उनका बिल नंबर लिखिए।',
        act: async (h) => {
          await nav(h, 'Purchases');
          await h.tap(h.btn(/^New bill/).or(h.link(/^New bill/)).first());
          await h.sleep(1500);
          await h.pick(h.ph('e.g. Agro Traders'), 'Gupta', 'Gupta Wholesale');
          await h.type(h.ph('e.g. AT/778'), 'GW-2291', { delay: 90 });
        } },
      { id: 'd09b', cap: 'Item — Sugar 1kg, quantity 50, cost ₹40, GST se pehle.', say: 'आइटम, शुगर एक किलो, क्वांटिटी पचास, कॉस्ट चालीस रुपये, जी एस टी से पहले।',
        act: async (h) => {
          await h.pickItem(1, 'Sugar', 'Sugar 1kg', 50);
          await h.type(h.page.locator('input[aria-label^="Cost"]').nth(0), '40', { delay: 150 });
        } },
      { id: 'd09c', cap: '"Record" dabaiye. Stock mein 50 Sugar jud gayi. Paisa abhi de diya, to bill wahin "Paid" ho jaata hai.', say: 'रिकॉर्ड दबाइए। स्टॉक में पचास शुगर जुड़ गई। पैसा अभी दे दिया, तो बिल वहीं पेड हो जाता है।',
        act: async (h) => {
          await h.tap(h.btn(/^Record$/));
          await h.sleep(1200);
          const c = h.dialog().getByRole('button', { name: /Record|Confirm/ }).last();
          if (await c.count()) await h.tap(c);
          await h.sleep(2200);
        } },
      { id: 'd09d', cap: 'Pichhla bill abhi baaki hai? Purchases mein "Unpaid" bill kholiye aur "Pay supplier" se bank ya UPI payment likhiye.', say: 'पिछला बिल अभी बाक़ी है? परचेज़ में अनपेड बिल खोलिए, और पे सप्लायर से बैंक या यू पी आई पेमेंट लिखिए।',
        act: async (h) => {
          await nav(h, 'Purchases');
          await h.tap(h.page.getByRole('tab', { name: /^Unpaid/ }).or(h.btn(/^Unpaid/)).first());
          await h.sleep(900);
          await h.tap(h.btn(/^Open PB\/.*Gupta Wholesale/).first());
          await h.sleep(1500);
          await h.tap(h.btn(/Pay supplier/));
          await h.sleep(1200);
          const d = h.dialog();
          const bank = d.getByRole('radio', { name: 'Bank' }).first();
          if (await bank.count()) await h.tap(bank);
          await h.tap(h.testid('payment-save').or(d.getByRole('button', { name: /Save|Pay/ }).last()).first());
          await h.sleep(2000);
        } },
    ],
  },
  {
    id: 'd10', target: '0:45', title: 'Kharche aur cashbook',
    card: { kicker: 'Chapter 10', title: 'Kharche aur galla', sub: 'Expenses · Cashbook' },
    problem: 'Chhote kharche likhe nahi jaate, aur shaam ko galla nahi milta.',
    feature: 'Expenses → Add expense (category, paid by, note); Cashbook: opening, money in, money out, closing per day; Cash vs Bank & UPI.',
    benefit: 'Roz ka galla milta hai; mahine ka kharcha category-wise.',
    steps: ['Sidebar → Expenses → Add expense', '₹250, category, Cash, note "Delivery auto" → Save', 'Sidebar → Cashbook', 'Filter Cash / Bank & UPI'],
    segments: [
      { id: 'd10a', cap: '"Add expense" dabaiye: amount ₹250, category, Cash, aur note — Delivery auto. Save.', say: 'ऐड एक्सपेंस दबाइए। अमाउंट ढाई सौ रुपये, कैटेगरी, कैश, और नोट, डिलीवरी ऑटो। सेव।',
        act: async (h) => {
          await nav(h, 'Expenses');
          await h.tap(h.btn(/Add expense/));
          const d = h.dialog();
          await h.type(d.locator('input[name="amount"]'), '250', { delay: 120 });
          await h.tap(d.getByRole('combobox', { name: /Choose a category|Category/ }).first());
          await h.sleep(500);
          const opt = h.page.getByRole('option', { name: /Travel|Transport|Delivery|Other/ }).first();
          await h.tap((await opt.count()) ? opt : h.page.getByRole('option').first());
          await h.type(d.locator('input[name="note"]'), 'Delivery auto');
          await h.tap(d.getByRole('button', { name: /^Save$/ }));
          await h.sleep(1500);
        } },
      { id: 'd10b', cap: 'Cashbook mein har din ka opening, aaya paisa, gaya paisa aur closing. Cash aur Bank-UPI alag bhi dekh sakte hain.', say: 'कैशबुक में हर दिन का ओपनिंग, आया पैसा, गया पैसा, और क्लोज़िंग। कैश और बैंक यू पी आई अलग भी देख सकते हैं।',
        act: async (h) => { await nav(h, 'Cashbook'); await h.tap(h.btn(/^Cash$/).or(h.page.getByRole('radio', { name: /^Cash$/ })).first()); await h.sleep(900); await h.scroll(300); } },
    ],
  },
  {
    id: 'd11', target: '1:15', title: 'Reports aur GST',
    card: { kicker: 'Chapter 11', title: 'Reports — CA ke liye taiyaar', sub: 'Day book · Registers · GST summary · Export' },
    problem: 'Mahine ke end mein CA ke liye bill, kharid aur GST ka hisaab jodna poora din le leta hai.',
    feature: 'Reports hub: Day book, Receivables/Payables aging, Stock summary, Sales register, Purchase register, GST summary (by rate, HSN, B2B/B2C); Export CSV on every report.',
    benefit: 'Ek click mein report; CSV seedha CA ko.',
    steps: ['Sidebar → Reports', 'Day book', 'Sales register (B2B / B2C)', 'GST summary: This month', 'Export'],
    segments: [
      { id: 'd11a', cap: 'Reports mein saari reports ek jagah hain — paisa, customer-supplier, stock, aur sales-GST.', say: 'रिपोर्ट्स में सारी रिपोर्ट्स एक जगह हैं। पैसा, कस्टमर सप्लायर, स्टॉक, और सेल्स जी एस टी।',
        act: async (h) => { await nav(h, 'Reports'); await h.sleep(800); } },
      { id: 'd11b', cap: 'Day book mein din ka har bill, payment aur kharcha samay ke kram se — cash aur bank ke saath.', say: 'डे बुक में दिन का हर बिल, पेमेंट, और ख़र्चा, समय के क्रम से। कैश और बैंक के साथ।',
        act: async (h) => { await h.tap(h.link(/^Day book/)); await h.sleep(1500); await h.scroll(300); } },
      { id: 'd11c', cap: 'Sales register mein har bill ka taxable value, CGST, SGST aur IGST. B2B aur B2C ke liye alag filter bhi hai.', say: 'सेल्स रजिस्टर में हर बिल का टैक्सेबल वैल्यू, सी जी एस टी, एस जी एस टी, और आई जी एस टी। बी टू बी और बी टू सी के लिए अलग फ़िल्टर भी है।',
        act: async (h) => { await h.goto('/reports/sales-register', 1500); await h.hover(h.text('Taxable value'), 900); await h.tap(h.btn(/^B2C$/).first()); await h.sleep(1500); await h.scroll(250, 900); } },
      { id: 'd11d', cap: 'GST summary mein rate ke hisaab se outward aur inward tax, HSN summary, aur bill series — GST return bharne ke liye taiyaar.', say: 'जी एस टी समरी में रेट के हिसाब से आउटवर्ड और इनवर्ड टैक्स, एच एस एन समरी, और बिल सीरीज़। जी एस टी रिटर्न भरने के लिए तैयार।',
        act: async (h) => { await h.goto('/reports/gst-summary', 1800); await h.scroll(400, 1400); await h.scroll(400, 1400); await h.top(); } },
      { id: 'd11e', cap: 'Har report par "Export" hai — CSV file download karke seedha CA ko bhej dijiye.', say: 'हर रिपोर्ट पर एक्सपोर्ट है। सी एस वी फ़ाइल डाउनलोड करके सीधा सी ए को भेज दीजिए।',
        act: async (h) => { await h.hover(h.btn(/^Export/), 1500); } },
    ],
  },
  {
    id: 'd12', target: '0:45', title: 'Purana data import',
    card: { kicker: 'Chapter 12', title: 'Purani book, ek file mein', sub: 'CSV import · export' },
    problem: 'Purane customers aur unka baaki ek-ek karke likhna ghanton ka kaam hai.',
    feature: 'Import data: download template → fill → Choose → check rows → import; Export on lists.',
    benefit: 'Minutes mein poori purani book app mein.',
    steps: ['Customers → Import (or /imports)', 'Download template', 'Customers → Choose → customers.csv', 'Row check (server job) → Import 3 customers', 'Go to customers: list updated'],
    segments: [
      { id: 'd12a', cap: 'Purane customers Excel mein hain? Import mein pehle template download kijiye, usme naam, mobile aur baaki bhariye.', say: 'पुराने कस्टमर्स एक्सेल में हैं? इम्पोर्ट में पहले टेम्पलेट डाउनलोड कीजिए, उसमें नाम, मोबाइल, और बाक़ी भरिए।',
        act: async (h) => { await h.goto('/imports', 1500); await h.hover(h.page.getByText('Download template').first(), 1200); } },
      { id: 'd12b', cap: 'Customers ke saamne "Choose" dabaiye aur apni CSV file chuniye. YourKhata har line check karta hai, aur galti wali line pehle hi bata deta hai.', say: 'कस्टमर्स के सामने चूज़ दबाइए, और अपनी सी एस वी फ़ाइल चुनिए। यौर खाता हर लाइन चेक करता है, और ग़लती वाली लाइन पहले ही बता देता है।',
        act: async (h) => {
          await h.tap(h.page.getByText('Choose', { exact: true }).first());
          const file = h.page.locator('input[type=file]').first();
          await file.waitFor({ state: 'attached', timeout: 10000 });
          await file.setInputFiles('/home/claude/video/pipeline/assets/customers.csv');
          // The row check is a server job (imports.validate): wait for the real result.
          await h.page.getByRole('button', { name: /^Import \d+ customers/ }).first().waitFor({ state: 'visible', timeout: 45000 });
          await h.sleep(1200);
        } },
      { id: 'd12c', cap: 'Sab theek hai, to "Import 3 customers" dabaiye. Teen naye customers unke purane baaki ke saath list mein aa gaye.', say: 'सब ठीक है, तो इम्पोर्ट थ्री कस्टमर्स दबाइए। तीन नए कस्टमर्स उनके पुराने बाक़ी के साथ लिस्ट में आ गए।',
        act: async (h) => {
          await h.tap(h.page.getByRole('button', { name: /^Import \d+ customers/ }).first());
          await h.page.getByText(/customers imported/).first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
          await h.sleep(1500);
          await h.tap(h.page.getByRole('button', { name: /Go to customers/ }).or(h.page.getByRole('link', { name: /Go to customers/ })).first());
          await h.sleep(1500);
          await h.expectText(/Kiran Provision/, 'imported customer in list');
        } },
    ],
  },
  {
    id: 'd13', target: '0:50', title: 'Team, activity log aur aapka data',
    card: { kicker: 'Chapter 13', title: 'Team aur suraksha', sub: 'Staff login · Activity log · Your data' },
    problem: 'Staff ko apna password dena risky hai; aur pata nahi chalta kisne kya badla.',
    feature: 'Team → Add member (role: Admin / Staff / Accountant; temporary password shown once); Activity log; Your data: download everything, support access only with your permission.',
    benefit: 'Har kisi ka apna login, har badlav ka record, aur data hamesha aapka.',
    steps: ['Sidebar → Team → Add member: Vikas, email, Staff → Create login', 'Temporary password (blurred) → send on WhatsApp', 'Settings → Activity log', 'Settings → Your data'],
    segments: [
      { id: 'd13a', cap: 'Team mein "Add member": naam Vikas, email, aur role Staff. Staff bill bana sakta hai, par settings nahi badal sakta.', say: 'टीम में ऐड मेंबर। नाम विकास, ईमेल, और रोल स्टाफ़। स्टाफ़ बिल बना सकता है, पर सेटिंग्स नहीं बदल सकता।',
        act: async (h) => {
          await nav(h, 'Team');
          await h.tap(h.btn(/Add member/));
          const d = h.dialog();
          await h.type(d.getByPlaceholder('Enter their full name'), 'Vikas');
          await h.type(d.getByPlaceholder('name@example.com'), h.state.staffEmail, { delay: 40 });
        } },
      { id: 'd13b', cap: '"Create login" — ek temporary password sirf ek baar dikhta hai (video mein chhupaya gaya hai). Ise WhatsApp se Vikas ko bhejiye.', say: 'क्रिएट लॉगिन। एक टेम्पररी पासवर्ड सिर्फ़ एक बार दिखता है, वीडियो में छुपाया गया है। इसे व्हाट्सऐप से विकास को भेजिए।',
        act: async (h) => { await h.tap(h.dialog().getByRole('button', { name: /Create login/ })); await h.sleep(2500); await h.page.keyboard.press('Escape').catch(() => {}); await h.sleep(500); } },
      { id: 'd13c', cap: 'Activity log mein har kaam — kisne, kab, kya kiya — likha rehta hai.', say: 'एक्टिविटी लॉग में हर काम, किसने, कब, क्या किया, लिखा रहता है।',
        act: async (h) => { await h.goto('/settings/activity', 1800); await h.scroll(250); } },
      { id: 'd13d', cap: '"Your data" se poora data ek ZIP mein download kijiye. Support team bhi aapki ijaazat ke bina aapka business nahi dekh sakti.', say: 'योर डेटा से पूरा डेटा एक ज़िप में डाउनलोड कीजिए। सपोर्ट टीम भी आपकी इजाज़त के बिना आपका बिज़नेस नहीं देख सकती।',
        act: async (h) => { await h.goto('/settings/data', 1800); await h.hover(h.btn(/Download all data/), 1200); } },
    ],
  },
  {
    id: 'd14', target: '0:20', title: 'Hindi mein chalaiye',
    card: { kicker: 'Chapter 14', title: 'Hindi mein bhi', sub: 'Account menu · Hindi' },
    problem: 'Staff English mein comfortable nahi.',
    feature: 'Account menu → language.',
    benefit: 'Jo bhasha aaye, usi mein kaam.',
    steps: ['Account menu → हिन्दी', 'Account menu → English'],
    segments: [
      { id: 'd14a', cap: 'Upar account menu se Hindi chuniye — poora app Hindi mein. Wapas English bhi yahin se.', say: 'ऊपर अकाउंट मेन्यू से हिंदी चुनिए। पूरा ऐप हिंदी में। वापस इंग्लिश भी यहीं से।',
        act: async (h) => {
          await h.goto('/dashboard', 1500);
          await h.tap(h.btn(/Account menu/));
          await h.tap(h.page.getByText('हिन्दी', { exact: true }).first());
          await h.sleep(2500);
          const eng = h.page.getByText('English', { exact: true }).first();
          if (!(await eng.isVisible().catch(() => false))) await h.tap(h.page.locator('header button').last());
          await h.tap(h.page.getByText('English', { exact: true }).first());
          await h.sleep(1500);
        } },
    ],
  },
  {
    id: 'd15', target: '0:25', title: 'Shukriya', cardOnly: true,
    card: { kicker: 'YourKhata', title: 'Aaj hi shuru kijiye', sub: 'yourkhata.com' },
    problem: '', feature: '', benefit: 'Hisaab, bills, stock aur collections — sab ek platform par.',
    segments: [
      { id: 'd15a', onCard: true, cap: 'To aapne dekha — udhaar, stock, GST bill, payment, kharid, kharche aur reports, sab ek hi jagah.', say: 'तो आपने देखा, उधार, स्टॉक, जी एस टी बिल, पेमेंट, ख़रीद, ख़र्चे, और रिपोर्ट्स, सब एक ही जगह।' },
      { id: 'd15c', onCard: true, cap: 'Lending & collections, Library, Gym & fitness aur Hotel & stays modules planned hain — ye abhi app mein nahi hain.', say: 'लेंडिंग एंड कलेक्शन्स, लाइब्रेरी, जिम एंड फ़िटनेस, और होटल एंड स्टेज़ मॉड्यूल्स प्लान्ड हैं। ये अभी ऐप में नहीं हैं।' },
      { id: 'd15b', onCard: true, cap: 'Video pasand aaya ho to share kijiye. YourKhata ke saath apne business ka hisaab aaj hi shuru kijiye. Dhanyavaad!', say: 'वीडियो पसंद आया हो तो शेयर कीजिए। यौर खाता के साथ अपने बिज़नेस का हिसाब आज ही शुरू कीजिए। धन्यवाद!' },
    ],
  },
];
