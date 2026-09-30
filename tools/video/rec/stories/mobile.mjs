/**
 * MOBILE demo (public) — vertical 1080×1920, phone 390×844 @2x, touch indicator.
 * Audience: shop owners. Hinglish narration (`say` = Devanagari for the TTS,
 * `cap` = Latin-script Hinglish for the burned-in captions / SRT).
 * Every chapter: problem → feature → steps → result/benefit.
 * Only VERIFIED features (HANDOFF §5/§6/§8b). No super-admin screens here.
 */
import { loginToken, seedBackground, saveAccount, loadAccount, randomPassword, gstinFor } from '../seed.mjs';

const menu = async (h, name) => {
  await h.tap(h.btn(/Open menu/));
  await h.sleep(500);
  await h.tap(h.page.getByRole('link', { name, exact: true }).last());
  await h.sleep(900);
};

export const meta = {
  id: 'mobile',
  profile: 'mobile',
  title: 'YourKhata — dukaan ka poora hisaab, phone par',
  stages: ['main'],
};

export async function prepare(h) {
  // Sign-up happens ON CAMERA, so only the credentials are made here.
  const stamp = Date.now().toString(36).slice(-5);
  const acct = { email: `rajesh.sharma.${stamp}@example.com`, password: randomPassword() };
  saveAccount('mobile', acct);
  h.state.acct = acct;
}

export const chapters = [
  {
    id: 'm00', title: 'Namaste! YourKhata se miliye', cardOnly: true,
    card: { kicker: 'YourKhata', title: 'Dukaan ka poora hisaab — phone par', sub: 'Udhaar khata · Stock · GST bill · Reports' },
    problem: 'Kaagaz ki khata-book kho jaati hai, galti hoti hai, aur udhaar yaad dilana mushkil hota hai.',
    feature: 'YourKhata: khata, stock aur GST billing ek hi app mein.',
    benefit: 'Har paisa likha hua, har customer ka balance turant.',
    segments: [
      { id: 'm00a', onCard: true, cap: 'Namaste! Is video mein hum dekhenge ki YourKhata se aap apni dukaan ka hisaab phone par kaise rakh sakte hain.', say: 'नमस्ते! इस वीडियो में हम देखेंगे कि योर खाता से आप अपनी दुकान का हिसाब फ़ोन पर कैसे रख सकते हैं।' },
      { id: 'm00b', onCard: true, cap: 'Udhaar khata, stock, GST bill aur reports — sab ek hi app mein.', say: 'उधार खाता, स्टॉक, जी एस टी बिल, और रिपोर्ट्स, सब कुछ एक ही ऐप में।' },
    ],
  },
  {
    id: 'm01', title: 'Account banaiye',
    card: { kicker: 'Step 1', title: 'Account banaiye', sub: 'Sirf email aur password' },
    problem: 'Naye app mein shuru karna mushkil lagta hai.',
    feature: 'Sign up: sirf email aur password.',
    benefit: 'Ek minute mein account taiyaar.',
    steps: ['/signup kholiye', 'Email likhiye', 'Password likhiye (dots mein chhupa rehta hai)', 'Create account par tap'],
    setup: async (h) => { await h.goto('/signup', 1500); },
    segments: [
      { id: 'm01a', onCard: true, cap: 'Sabse pehle account banate hain. Iske liye sirf ek email aur password chahiye.', say: 'सबसे पहले अकाउंट बनाते हैं। इसके लिए सिर्फ़ एक ईमेल और पासवर्ड चाहिए।' },
      { id: 'm01b', cap: 'Apna email likhiye.', say: 'अपना ईमेल लिखिए।',
        act: async (h) => {
          const name = h.page.getByPlaceholder('Enter your full name');
          if (await name.count()) await h.type(name.first(), 'Rajesh Sharma');
          await h.type(h.loc('input[type="email"]'), h.state.acct.email, { delay: 45 });
        } },
      { id: 'm01c', cap: 'Ab ek mazboot password banaiye. Password hamesha chhupa rehta hai.', say: 'अब एक मज़बूत पासवर्ड बनाइए। पासवर्ड हमेशा छुपा रहता है।',
        act: async (h) => { await h.type(h.loc('input[type="password"]').first(), h.state.acct.password, { delay: 60 }); } },
      { id: 'm01d', cap: 'Create account par tap kijiye. Bas, aapka account ban gaya.', say: 'क्रिएट अकाउंट पर टैप कीजिए। बस, आपका अकाउंट बन गया।',
        act: async (h) => {
          await h.tap(h.loc('button[type="submit"]'));
          await h.page.waitForURL((u) => !u.pathname.startsWith('/signup'), { timeout: 30000 });
          await h.sleep(1500);
        } },
    ],
  },
  {
    id: 'm02', title: 'Dukaan ki jaankari',
    card: { kicker: 'Step 2', title: 'Apni dukaan set kijiye', sub: 'Naam · kaam ka type · state · GST' },
    problem: 'Har bill par dukaan ka naam, GSTIN aur pata sahi chahiye.',
    feature: 'Onboarding: chaar chhote steps; jo lagu na ho, skip.',
    benefit: 'Bill aur statement par sahi jaankari apne aap chhapti hai.',
    steps: ['Business name: Sharma General Store', 'Type: Retail shop', 'State: Maharashtra', 'GST: Regular + GSTIN', 'Address', 'Start using YourKhata'],
    segments: [
      { id: 'm02a', onCard: true, cap: 'Ab apni dukaan ki jaankari bharte hain. Sirf chaar chhote steps hain.', say: 'अब अपनी दुकान की जानकारी भरते हैं। सिर्फ़ चार छोटे स्टेप्स हैं।' },
      { id: 'm02b', cap: 'Dukaan ka naam likhiye — Sharma General Store — aur business type mein Retail shop chuniye.', say: 'दुकान का नाम लिखिए, शर्मा जनरल स्टोर, और बिज़नेस टाइप में रिटेल शॉप चुनिए।',
        act: async (h) => {
          await h.type(h.ph('e.g. Kumar Stores'), 'Sharma General Store');
          await h.tap(h.page.getByText('Retail shop', { exact: true }).first());
        } },
      { id: 'm02c', cap: 'State chuniye — Maharashtra — aur Continue dabaiye.', say: 'स्टेट चुनिए, महाराष्ट्र, और कंटिन्यू दबाइए।',
        act: async (h) => {
          const st = h.page.getByRole('combobox', { name: /State/ }).first();
          await h.tap((await st.count()) ? st : h.text('Choose your state'));
          const search = h.ph('Search states');
          if (await search.count()) await h.type(search, 'Mahara', { delay: 90 });
          await h.tap(h.page.getByRole('option', { name: /Maharashtra/ }).first());
          await h.tap(h.btn(/^Continue$/));
          await h.sleep(1500);
        } },
      { id: 'm02d', cap: 'GST registered hain to Regular GST chuniye aur apna GSTIN likhiye. Registered nahi hain to skip kar dijiye.', say: 'जी एस टी रजिस्टर्ड हैं, तो रेगुलर जी एस टी चुनिए, और अपना जी एस टी आई एन लिखिए। रजिस्टर्ड नहीं हैं, तो स्किप कर दीजिए।',
        act: async (h) => {
          await h.tap(h.page.getByText('Regular GST', { exact: true }).first());
          await h.type(h.ph('e.g. 27ABCDE1234F1Z5'), gstinFor(Date.now()), { delay: 60 });
          await h.tap(h.btn(/^Continue$/));
          await h.sleep(1500);
        } },
      { id: 'm02e', cap: 'Dukaan ka pata likhiye. Ye aapke bill aur statement ke upar chhapega.', say: 'दुकान का पता लिखिए। यह आपके बिल और स्टेटमेंट के ऊपर छपेगा।',
        act: async (h) => {
          await h.type(h.ph('Shop number, building, street'), '14 Mahatma Phule Road', { delay: 45 });
          await h.type(h.ph('e.g. Pune').first(), 'Pune', { delay: 60 });
          await h.type(h.ph('6-digit PIN code'), '411002', { delay: 80 });
          await h.tap(h.btn(/^Continue$/));
          await h.sleep(1500);
        } },
      { id: 'm02f', cap: 'Aakhri step mein YourKhata batata hai ki aapke kaam ke hisaab se kya-kya set hoga. Start par tap kijiye.', say: 'आख़िरी स्टेप में योर खाता बताता है कि आपके काम के हिसाब से क्या क्या सेट होगा। स्टार्ट पर टैप कीजिए।',
        act: async (h) => {
          await h.scroll(300);
          await h.tap(h.btn(/Start using/));
          await h.page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 30000 });
          await h.sleep(1500);
        } },
    ],
  },
  {
    id: 'm03', title: 'Dashboard aur menu',
    card: { kicker: 'Step 3', title: 'Dashboard — ek nazar mein dukaan', sub: 'Kitna lena hai · kitna dena hai · aaj ki sale' },
    problem: 'Subah-subah pata nahi hota ki kitna udhaar baaki hai aur kya khatam ho raha hai.',
    feature: 'Dashboard tiles aur side menu.',
    benefit: 'Ek screen par poori dukaan ki halat.',
    steps: ['Dashboard tiles dekhiye', 'Open menu: Daily / Business / Insight / Account', 'Menu band'],
    // Off camera: a few weeks of history so the dashboard is realistic (Ramesh Traders is created ON camera later).
    setup: async (h) => {
      const tok = await loginToken(h.state.acct.email, h.state.acct.password);
      h.state.ids = await seedBackground(tok, { skip: ['Ramesh Traders'], profile: false });
      saveAccount('mobile', { ...h.state.acct, ids: h.state.ids });
      await h.goto('/dashboard', 2500);
    },
    segments: [
      { id: 'm03a', onCard: true, cap: 'Ye hai aapka dashboard. Yahan ek nazar mein poori dukaan dikhti hai.', say: 'यह है आपका डैशबोर्ड। यहाँ एक नज़र में पूरी दुकान दिखती है।' },
      { id: 'm03b', cap: 'To collect — sabse kitna paisa lena hai. To pay — suppliers ko kitna dena hai.', say: 'टू कलेक्ट, यानी सबसे कितना पैसा लेना है। टू पे, यानी सप्लायर्स को कितना देना है।',
        act: async (h) => { await h.hover(h.btn(/To collect/)); await h.hover(h.btn(/To pay/)); } },
      { id: 'm03c', cap: 'Aaj ki sale, galle mein cash, aur kaunsa maal khatam ho raha hai — sab yahin.', say: 'आज की सेल, गल्ले में कैश, और कौन सा माल ख़त्म हो रहा है, सब यहीं।',
        act: async (h) => { await h.hover(h.btn(/Today's sales/)); await h.hover(h.btn(/Cash in hand/)); await h.hover(h.btn(/Low stock/)); } },
      { id: 'm03d', cap: 'Upar menu button se saare hisse khulte hain: Customers, Bills, Items, Purchases, Reports aur Settings.', say: 'ऊपर मेन्यू बटन से सारे हिस्से खुलते हैं। कस्टमर्स, बिल्स, आइटम्स, परचेज़, रिपोर्ट्स, और सेटिंग्स।',
        act: async (h) => { await h.tap(h.btn(/Open menu/)); await h.sleep(1800); await h.scroll(250, 700); } },
      { id: 'm03e', cap: 'Chaliye, pehla kaam karte hain — ek customer ka udhaar likhna.', say: 'चलिए, पहला काम करते हैं, एक कस्टमर का उधार लिखना।',
        act: async (h) => { await h.tap(h.page.getByRole('link', { name: 'Customers', exact: true }).last()); await h.sleep(1200); } },
    ],
  },
  {
    id: 'm04', title: 'Udhaar khata',
    card: { kicker: 'Step 4', title: 'Udhaar ka hisaab', sub: 'You gave · You got · balance apne aap' },
    problem: 'Kaagaz par udhaar likhne mein galti hoti hai, aur customer se behas hoti hai.',
    feature: 'Customer khata: You gave / You got entries, running balance.',
    benefit: 'Har entry tareekh ke saath; balance hamesha sahi.',
    steps: ['Add party (+)', 'Naam: Ramesh Traders, mobile', 'Save party', 'You gave ₹1,200 "Monthly ration"', 'You got ₹500', 'Balance ₹700'],
    segments: [
      { id: 'm04a', onCard: true, cap: 'Problem: kaagaz par udhaar likhne mein galti hoti hai, aur baad mein behas hoti hai. YourKhata mein har entry tareekh ke saath save hoti hai.', say: 'समस्या यह है कि काग़ज़ पर उधार लिखने में ग़लती होती है, और बाद में बहस होती है। योर खाता में हर एंट्री तारीख़ के साथ सेव होती है।' },
      { id: 'm04b', cap: 'Plus button se naya customer jodiye. Naam likhiye — Ramesh Traders — aur mobile number.', say: 'प्लस बटन से नया कस्टमर जोड़िए। नाम लिखिए, रमेश ट्रेडर्स, और मोबाइल नंबर।',
        act: async (h) => {
          await h.tap(h.btn(/Add party/));
          await h.type(h.ph('e.g. Ramesh Traders'), 'Ramesh Traders');
          await h.type(h.ph('10-digit mobile number'), '9800000101', { delay: 90 });
        } },
      { id: 'm04c', cap: 'Save party dabaiye. Ramesh Traders ka khata khul gaya.', say: 'सेव पार्टी दबाइए। रमेश ट्रेडर्स का खाता खुल गया।',
        act: async (h) => { await h.tap(h.btn(/Save party/)); await h.sleep(2200); } },
      { id: 'm04d', cap: 'Ramesh ji ₹1,200 ka ration udhaar le gaye. "You gave" par tap kijiye, amount aur note likhiye, Save.', say: 'रमेश जी बारह सौ रुपये का राशन उधार ले गए। यू गेव पर टैप कीजिए, अमाउंट और नोट लिखिए, और सेव कीजिए।',
        act: async (h) => {
          await h.tap(h.btn(/^You gave/));
          await h.type(h.dialog().locator('input[name="amount"]'), '1200', { delay: 120 });
          await h.type(h.dialog().locator('input[name="note"]'), 'Monthly ration');
          await h.tap(h.dialog().getByRole('button', { name: /^Save$/ }));
          await h.sleep(1500);
        } },
      { id: 'm04e', cap: 'Kuch din baad unhone ₹500 de diye. Is baar "You got" par tap kijiye.', say: 'कुछ दिन बाद उन्होंने पाँच सौ रुपये दे दिए। इस बार यू गॉट पर टैप कीजिए।',
        act: async (h) => {
          await h.tap(h.btn(/^You got/));
          await h.type(h.dialog().locator('input[name="amount"]'), '500', { delay: 120 });
          await h.tap(h.dialog().getByRole('button', { name: /^Save$/ }));
          await h.sleep(1500);
        } },
      { id: 'm04f', cap: 'Result: balance apne aap ₹700 ho gaya. Har entry tareekh ke saath neeche list mein hai.', say: 'नतीजा, बैलेंस अपने आप सात सौ रुपये हो गया। हर एंट्री तारीख़ के साथ नीचे लिस्ट में है।',
        act: async (h) => { await h.expectText(/700\.00/, 'balance ₹700'); await h.scroll(300); await h.top(); } },
    ],
  },
  {
    id: 'm05', title: 'Yaad dilaiye (reminder)',
    card: { kicker: 'Step 5', title: 'Udhaar wapas lijiye', sub: 'WhatsApp reminder · Aging' },
    problem: 'Udhaar maangna awkward lagta hai, aur bhool bhi jaate hain.',
    feature: 'Send reminder (WhatsApp/SMS) aur Aging list.',
    benefit: 'Paisa jaldi wapas; pata rehta hai kisko pehle phone karna hai.',
    steps: ['More actions → Send reminder', 'Message preview → WhatsApp', 'Menu → Aging: 0–30, 31–60, 61–90, 90+ din'],
    segments: [
      { id: 'm05a', onCard: true, cap: 'Udhaar maangna thoda awkward lagta hai. YourKhata ek polite message taiyaar kar deta hai.', say: 'उधार माँगना थोड़ा ऑकवर्ड लगता है। योर खाता एक पोलाइट मैसेज तैयार कर देता है।' },
      { id: 'm05b', cap: 'Teen dots wale button se "Send reminder" chuniye. Message mein naam, baaki rakam aur dukaan ka naam pehle se likha hai.', say: 'तीन डॉट वाले बटन से सेंड रिमाइंडर चुनिए। मैसेज में नाम, बाक़ी रक़म, और दुकान का नाम पहले से लिखा है।',
        act: async (h) => {
          await h.tap(h.btn(/More actions/));
          await h.tap(h.page.getByRole('button', { name: /Send reminder/ }).last());
          await h.sleep(1800);
        } },
      { id: 'm05c', cap: 'WhatsApp par tap kijiye — message seedha Ramesh ji ke number par khulta hai. Aapko sirf Send dabana hai.', say: 'व्हाट्सऐप पर टैप कीजिए। मैसेज सीधा रमेश जी के नंबर पर खुलता है। आपको सिर्फ़ सेंड दबाना है।',
        act: async (h) => {
          const wa = h.page.getByRole('button', { name: /WhatsApp/ }).last();
          if (await wa.count()) await h.tap(wa);
          await h.sleep(1200);
          await h.page.keyboard.press('Escape').catch(() => {});
        } },
      { id: 'm05d', cap: 'Aur Aging screen batati hai ki kiska udhaar kitne dino se pada hai — 0 se 30 din, 31 se 60, aur usse purana.', say: 'और एजिंग स्क्रीन बताती है कि किसका उधार कितने दिनों से पड़ा है। शून्य से तीस दिन, इकतीस से साठ, और उससे पुराना।',
        act: async (h) => { await menu(h, 'Aging'); await h.hover(h.text(/0–30 days|0-30 days/)); await h.hover(h.text(/61–90 days|61-90 days/)); } },
      { id: 'm05e', cap: 'Benefit: sabse purane udhaar wale ko pehle phone kijiye, aur paisa jaldi wapas laaiye.', say: 'फ़ायदा यह है कि सबसे पुराने उधार वाले को पहले फ़ोन कीजिए, और पैसा जल्दी वापस लाइए।',
        act: async (h) => { await h.scroll(350); } },
    ],
  },
  {
    id: 'm06', title: 'Stock aur items',
    card: { kicker: 'Step 6', title: 'Stock ki chinta khatam', sub: 'Items · low stock alert' },
    problem: 'Maal khatam hone ka pata tab chalta hai jab customer maang leta hai.',
    feature: 'Items list, stock on hand, Low stock tab, stock movements.',
    benefit: 'Samay par order; bikri kabhi nahi rukti.',
    steps: ['Menu → Items', 'Low tab → Sugar 1kg', 'Item detail: stock, average cost, movements'],
    segments: [
      { id: 'm06a', onCard: true, cap: 'Maal khatam hone ka pata aksar tab chalta hai jab customer maang leta hai. Items screen ye problem hal karti hai.', say: 'माल ख़त्म होने का पता अक्सर तब चलता है, जब कस्टमर माँग लेता है। आइटम्स स्क्रीन यह समस्या हल करती है।' },
      { id: 'm06b', cap: 'Har item ke saath dukaan mein kitna maal hai, wo dikhta hai. Stock value bhi upar hai.', say: 'हर आइटम के साथ दुकान में कितना माल है, वह दिखता है। स्टॉक वैल्यू भी ऊपर है।',
        act: async (h) => { await menu(h, 'Items'); await h.hover(h.text(/Stock value/)); } },
      { id: 'm06c', cap: '"Low" tab par tap kijiye — Sugar kam hai. Ye reorder level se neeche aa gaya hai.', say: 'लो टैब पर टैप कीजिए। शुगर कम है। यह रीऑर्डर लेवल से नीचे आ गया है।',
        act: async (h) => { await h.tap(h.page.getByRole('tab', { name: /^Low/ }).first()); await h.sleep(1200); } },
      { id: 'm06d', cap: 'Item kholne par har aana-jaana dikhta hai — opening stock, bikri aur kharid.', say: 'आइटम खोलने पर हर आना जाना दिखता है। ओपनिंग स्टॉक, बिक्री, और ख़रीद।',
        act: async (h) => { await h.tap(h.btn(/Open Sugar 1kg/)); await h.sleep(1500); await h.scroll(420); } },
    ],
  },
  {
    id: 'm07', title: 'GST bill banaiye',
    card: { kicker: 'Step 7', title: 'GST bill — 1 minute mein', sub: 'Items · GST apne aap · part payment · WhatsApp' },
    problem: 'Haath se GST bill banana dheema hai, aur tax ka hisaab galat ho sakta hai.',
    feature: 'New bill: party, items, CGST+SGST apne aap, Issue ke saath payment.',
    benefit: 'Sahi GST bill, stock kam, baaki rakam khata mein — ek saath.',
    steps: ['Menu → Bills → +', 'Party: Ramesh Traders', 'Basmati Rice 5kg × 2, Toor Dal 1kg × 3', 'Totals: CGST + SGST', 'Issue → ₹500 UPI', 'Bill: UPI QR, Share on WhatsApp'],
    segments: [
      { id: 'm07a', onCard: true, cap: 'Haath se GST bill banana dheema hai, aur tax ka hisaab galat ho sakta hai. Dekhiye YourKhata mein kitna aasaan hai.', say: 'हाथ से जी एस टी बिल बनाना धीमा है, और टैक्स का हिसाब ग़लत हो सकता है। देखिए योर खाता में कितना आसान है।' },
      { id: 'm07b', cap: 'Bills mein plus dabaiye. "Party" chuniye aur Ramesh Traders dhoondiye.', say: 'बिल्स में प्लस दबाइए। पार्टी चुनिए, और रमेश ट्रेडर्स ढूँढिए।',
        act: async (h) => {
          await menu(h, 'Bills');
          await h.goto('/sales/invoices/new', 1500);
          await h.tap(h.page.getByRole('radio', { name: 'Party' }));
          await h.pick(h.ph('Search by name or mobile'), 'Rame', 'Ramesh Traders');
        } },
      { id: 'm07c', cap: 'Ab item jodiye — Basmati Rice 5kg, quantity 2. Rate aur GST item se apne aap aa jaate hain.', say: 'अब आइटम जोड़िए। बासमती राइस पाँच किलो, क्वांटिटी दो। रेट और जी एस टी आइटम से अपने आप आ जाते हैं।',
        act: async (h) => {
          await h.tap(h.page.getByRole('combobox', { name: /Item, Line 1/ }));
          await h.page.keyboard.type('Basm', { delay: 120 });
          await h.sleep(1200);
          await h.tap(h.page.getByRole('option', { name: /Basmati Rice 5kg/ }).first());
          await h.type(h.page.locator('input[aria-label^="Qty"]').nth(0), '2', { delay: 150 });
        } },
      { id: 'm07d', cap: 'Ek aur item — Toor Dal 1kg, quantity 3.', say: 'एक और आइटम, तूर दाल एक किलो, क्वांटिटी तीन।',
        act: async (h) => {
          await h.tap(h.btn(/^Add item$/));
          await h.tap(h.page.getByRole('combobox', { name: /Item, Line 2/ }));
          await h.page.keyboard.type('Toor', { delay: 120 });
          await h.sleep(1200);
          await h.tap(h.page.getByRole('option', { name: /Toor Dal 1kg/ }).first());
          await h.type(h.page.locator('input[aria-label^="Qty"]').nth(1), '3', { delay: 150 });
        } },
      { id: 'm07e', cap: 'Neeche total dekhiye. Same state ka customer hai, isliye CGST aur SGST apne aap lag gaya.', say: 'नीचे टोटल देखिए। सेम स्टेट का कस्टमर है, इसलिए सी जी एस टी और एस जी एस टी अपने आप लग गया।',
        act: async (h) => { await h.scrollTo(h.testid('invoice-totals')); await h.hover(h.testid('invoice-grand-total'), 1200); } },
      { id: 'm07f', cap: 'Issue dabaiye. Ramesh ji abhi ₹500 UPI se de rahe hain — amount badliye, UPI chuniye.', say: 'इश्यू दबाइए। रमेश जी अभी पाँच सौ रुपये यू पी आई से दे रहे हैं। अमाउंट बदलिए, और यू पी आई चुनिए।',
        act: async (h) => {
          await h.tap(h.testid('invoice-issue'));
          await h.sleep(1200);
          const amt = h.dialog().getByLabel('Amount').first();
          await h.type(amt, '500', { delay: 150 });
          const upi = h.dialog().getByRole('radio', { name: /Google Pay|PhonePe|Other UPI|UPI/ }).first();
          if (await upi.count()) await h.tap(upi);
        } },
      { id: 'm07g', cap: 'Confirm kijiye. Bill ban gaya, stock kam ho gaya, aur baaki rakam Ramesh ji ke khata mein jud gayi.', say: 'कन्फ़र्म कीजिए। बिल बन गया, स्टॉक कम हो गया, और बाक़ी रक़म रमेश जी के खाते में जुड़ गई।',
        act: async (h) => {
          await h.tap(h.testid('invoice-payment-confirm'));
          await h.sleep(2500);
          const view = h.page.getByRole('link', { name: /View bill/ }).or(h.page.getByRole('button', { name: /View bill/ })).first();
          if (await view.count()) await h.tap(view);
          await h.sleep(2000);
        } },
      { id: 'm07h', cap: 'Bill par UPI QR code bhi chhapta hai — customer scan karke turant paisa bhej sakta hai.', say: 'बिल पर यू पी आई क्यू आर कोड भी छपता है। कस्टमर स्कैन करके तुरंत पैसा भेज सकता है।',
        act: async (h) => { const qr = h.testid('upi-qr'); if (await qr.count()) await h.scrollTo(qr); await h.sleep(800); await h.top(); } },
      { id: 'm07i', cap: '"Share on WhatsApp" se bill ka link customer ko chala jaata hai.', say: 'शेयर ऑन व्हाट्सऐप से बिल का लिंक कस्टमर को चला जाता है।',
        act: async (h) => {
          h.rec.lastPopup = null;
          await h.tap(h.btn(/Share on WhatsApp/));
          await h.sleep(2000);
          const m = decodeURIComponent(h.rec.lastPopup ?? '').match(/https?:\/\/[^\s]+\/d\/[A-Za-z0-9_-]+/);
          h.state.shareUrl = m?.[0] ?? null;
        } },
      { id: 'm07j', cap: 'Customer ke phone par bill aisa dikhta hai — dukaan ka naam, items, total aur baaki rakam. Bina app ke.', say: 'कस्टमर के फ़ोन पर बिल ऐसा दिखता है। दुकान का नाम, आइटम्स, टोटल, और बाक़ी रक़म। बिना ऐप के।',
        act: async (h) => {
          if (!h.state.shareUrl) throw new Error('share link was not captured');
          const u = new URL(h.state.shareUrl);
          await h.goto(u.pathname, 2500); // no browser chrome: the token never appears on screen
          await h.scroll(400, 1200);
        } },
    ],
  },
  {
    id: 'm08', title: 'Supplier se kharid',
    card: { kicker: 'Step 8', title: 'Maal kharida? Purchase bill', sub: 'Stock badhta hai · supplier ka hisaab' },
    problem: 'Supplier ke bill alag file mein, aur stock haath se update karna padta hai.',
    feature: 'Purchase bill: supplier, bill number, items; record karte hi stock badhta hai.',
    benefit: 'Stock aur supplier ka baaki — dono apne aap sahi.',
    steps: ['Menu → Purchases → +', 'Supplier: Gupta Wholesale', 'Supplier invoice no.', 'Sugar 1kg × 50 @ ₹40', 'Record'],
    setup: async (h) => { await h.goto('/purchases/bills', 1500); },
    segments: [
      { id: 'm08a', onCard: true, cap: 'Sugar kam tha, to Gupta Wholesale se pachaas packet mangwaye. Unka bill bhi YourKhata mein daal dete hain.', say: 'शुगर कम थी, तो गुप्ता होलसेल से पचास पैकेट मँगवाए। उनका बिल भी योर खाता में डाल देते हैं।' },
      { id: 'm08b', cap: 'Purchases mein plus dabaiye aur supplier chuniye — Gupta Wholesale. Unka bill number bhi likhiye.', say: 'परचेज़ में प्लस दबाइए, और सप्लायर चुनिए, गुप्ता होलसेल। उनका बिल नंबर भी लिखिए।',
        act: async (h) => {
          await h.tap(h.btn(/New purchase|Add|New bill|Record/).or(h.page.getByRole('link', { name: /New/ })).first());
          await h.sleep(1500);
          await h.pick(h.ph('e.g. Agro Traders'), 'Gupta', 'Gupta Wholesale');
          await h.type(h.ph('e.g. AT/778'), 'GW-2291', { delay: 90 });
        } },
      { id: 'm08c', cap: 'Item — Sugar 1kg, quantity 50, cost ₹40.', say: 'आइटम, शुगर एक किलो, क्वांटिटी पचास, कॉस्ट चालीस रुपये।',
        act: async (h) => {
          await h.scrollTo(h.page.getByRole('combobox', { name: /Item, Line 1/ }));
          await h.tap(h.page.getByRole('combobox', { name: /Item, Line 1/ }));
          await h.page.keyboard.type('Sugar', { delay: 120 });
          await h.sleep(1200);
          await h.tap(h.page.getByRole('option', { name: /Sugar 1kg/ }).first());
          await h.type(h.page.locator('input[aria-label^="Qty"]').nth(0), '50', { delay: 150 });
          const cost = h.page.locator('input[aria-label^="Cost"],input[aria-label^="Rate"]').first();
          await h.type(cost, '40', { delay: 150 });
        } },
      { id: 'm08d', cap: 'Record dabaiye. Stock mein 50 Sugar jud gayi, aur Gupta Wholesale ka baaki bhi likh gaya.', say: 'रिकॉर्ड दबाइए। स्टॉक में पचास शुगर जुड़ गई, और गुप्ता होलसेल का बाक़ी भी लिख गया।',
        act: async (h) => {
          const rec = h.page.getByRole('button', { name: /^Record|Record bill|Save & record/ }).first();
          await h.tap((await rec.count()) ? rec : h.page.locator('header button, main button').filter({ has: h.page.locator('svg') }).nth(1));
          await h.sleep(1500);
          const conf = h.dialog().getByRole('button', { name: /Record|Confirm|Save/ }).last();
          if (await conf.count()) await h.tap(conf);
          await h.sleep(2000);
        } },
    ],
  },
  {
    id: 'm09', title: 'Kharche aur cashbook',
    card: { kicker: 'Step 9', title: 'Dukaan ke kharche', sub: 'Expense · cashbook' },
    problem: 'Chhote kharche — chai, auto, bijli — kahin likhe nahi jaate, aur galla milta nahi.',
    feature: 'Add expense (category, mode) aur Cashbook.',
    benefit: 'Roz ka galla milta hai; mahine ka kharcha saaf dikhta hai.',
    steps: ['Menu → Expenses → +', '₹250, category, Cash, note "Delivery auto"', 'Save', 'Menu → Cashbook'],
    segments: [
      { id: 'm09a', onCard: true, cap: 'Chai, auto, bijli ke chhote kharche aksar likhe nahi jaate. Phir shaam ko galla nahi milta.', say: 'चाय, ऑटो, बिजली के छोटे ख़र्चे अक्सर लिखे नहीं जाते। फिर शाम को गल्ला नहीं मिलता।' },
      { id: 'm09b', cap: 'Expenses mein plus dabaiye. Amount ₹250, category chuniye, Cash, aur note — Delivery auto.', say: 'एक्सपेंसेस में प्लस दबाइए। अमाउंट ढाई सौ रुपये, कैटेगरी चुनिए, कैश, और नोट, डिलीवरी ऑटो।',
        act: async (h) => {
          await menu(h, 'Expenses');
          await h.tap(h.btn(/Add expense/));
          await h.type(h.dialog().locator('input[name="amount"]'), '250', { delay: 120 });
          await h.tap(h.dialog().getByRole('combobox', { name: /Choose a category|Category/ }).first());
          await h.sleep(600);
          const opt = h.page.getByRole('option', { name: /Travel|Transport|Delivery|Other/ }).first();
          await h.tap((await opt.count()) ? opt : h.page.getByRole('option').first());
          await h.type(h.dialog().locator('input[name="note"]'), 'Delivery auto');
        } },
      { id: 'm09c', cap: 'Save kijiye. Ab Cashbook mein har din ka opening, aaya paisa, gaya paisa aur closing — sab milta hai.', say: 'सेव कीजिए। अब कैशबुक में हर दिन का ओपनिंग, आया पैसा, गया पैसा, और क्लोज़िंग, सब मिलता है।',
        act: async (h) => {
          await h.tap(h.dialog().getByRole('button', { name: /^Save$/ }));
          await h.sleep(1500);
          await menu(h, 'Cashbook');
          await h.sleep(800);
          await h.scroll(300);
        } },
    ],
  },
  {
    id: 'm10', title: 'Reports',
    card: { kicker: 'Step 10', title: 'Reports — CA ke liye taiyaar', sub: 'Day book · GST summary' },
    problem: 'Mahine ke end mein CA ko hisaab dena bada kaam lagta hai.',
    feature: 'Reports: Day book, Sales register, GST summary, CSV export.',
    benefit: 'Ek tap mein report; CA ko seedha bhejiye.',
    steps: ['Menu → Reports', 'Day book', 'GST summary'],
    segments: [
      { id: 'm10a', onCard: true, cap: 'Mahine ke end mein CA ko hisaab dena ab bada kaam nahi hai.', say: 'महीने के एंड में सी ए को हिसाब देना, अब बड़ा काम नहीं है।' },
      { id: 'm10b', cap: 'Day book mein aaj ka har bill, payment aur kharcha kram se dikhta hai.', say: 'डे बुक में आज का हर बिल, पेमेंट, और ख़र्चा, क्रम से दिखता है।',
        act: async (h) => { await menu(h, 'Reports'); await h.tap(h.link(/Day book/)); await h.sleep(1500); await h.scroll(450, 1400); } },
      { id: 'm10c', cap: 'GST summary mein rate ke hisaab se tax ka poora hisaab milta hai. Download button se CSV file CA ko bhej dijiye.', say: 'जी एस टी समरी में रेट के हिसाब से टैक्स का पूरा हिसाब मिलता है। डाउनलोड बटन से सी एस वी फ़ाइल सी ए को भेज दीजिए।',
        act: async (h) => {
          await h.goto('/reports/gst-summary', 1500);
          await h.tap(h.page.getByRole('button', { name: /^This month$/ }).first()).catch(() => {});
          await h.scroll(350, 1200);
        } },
    ],
  },
  {
    id: 'm11', title: 'Hindi mein bhi',
    card: { kicker: 'Step 11', title: 'Hindi mein bhi chalaiye', sub: 'Language · aapka data' },
    problem: 'Staff ya ghar ke log English mein comfortable nahi.',
    feature: 'Account menu → हिन्दी; Settings → Your data.',
    benefit: 'Jo bhasha aaye, usi mein kaam.',
    steps: ['Account menu → हिन्दी', 'Dashboard Hindi mein', 'Wapas English'],
    segments: [
      { id: 'm11a', onCard: true, cap: 'Aur haan, poora app Hindi mein bhi chalta hai.', say: 'और हाँ, पूरा ऐप हिंदी में भी चलता है।' },
      { id: 'm11b', cap: 'Upar profile button dabaiye aur Hindi chuniye. Poora app Hindi mein badal gaya.', say: 'ऊपर प्रोफ़ाइल बटन दबाइए, और हिंदी चुनिए। पूरा ऐप हिंदी में बदल गया।',
        act: async (h) => {
          await h.goto('/dashboard', 1500);
          await h.tap(h.btn(/Account menu/));
          await h.tap(h.page.getByText('हिन्दी', { exact: true }).first());
          await h.sleep(2500);
        } },
      { id: 'm11c', cap: 'Wapas English ke liye yahi se English chun lijiye.', say: 'वापस इंग्लिश के लिए यहीं से इंग्लिश चुन लीजिए।',
        act: async (h) => {
          await h.tap(h.page.getByRole('button', { name: /Rajesh Sharma/ }).first());
          await h.tap(h.page.getByText('English', { exact: true }).first());
          await h.sleep(2000);
        } },
    ],
  },
  {
    id: 'm12', title: 'Shukriya', cardOnly: true,
    card: { kicker: 'YourKhata', title: 'Aaj hi shuru kijiye', sub: 'yourkhata.com' },
    problem: '', feature: '', benefit: 'Khata, stock, GST bill aur reports — sab ek app mein.',
    segments: [
      { id: 'm12a', onCard: true, cap: 'To dekha aapne — udhaar, stock, GST bill, kharche aur reports, sab ek hi app mein.', say: 'तो देखा आपने, उधार, स्टॉक, जी एस टी बिल, ख़र्चे, और रिपोर्ट्स, सब एक ही ऐप में।' },
      { id: 'm12b', onCard: true, cap: 'YourKhata ke saath apni dukaan ka hisaab aaj hi shuru kijiye. Dhanyavaad!', say: 'योर खाता के साथ अपनी दुकान का हिसाब आज ही शुरू कीजिए। धन्यवाद!' },
    ],
  },
];
