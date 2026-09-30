# YourKhata — ek platform, saara hisaab: Shop & billing phone par

YourKhata is one platform where a business keeps its records, bills, stock and collections in one place. This video shows the live module, Shop & billing, on a phone: sign up, set up the shop, and run every daily workflow with realistic sample data. Every chapter follows problem → feature → steps → result. Planned modules (Lending & collections, Library, Gym & fitness, Hotel & stays) are named once in the closing card as planned, with no UI and no dates.

| | |
|---|---|
| Format | Vertical 1080×1920 (phone viewport 390×844 @2x), H.264 + AAC, burned-in Hinglish captions + SRT |
| Audience | Shop owners and their staff (public: clients/users). Non-technical; WhatsApp-first. |
| Target length | 6–8 min |
| Narration length | 8:04 (measured TTS) |
| Voice | Kokoro hm_omega (Hindi, male), speed 1.05; captions in Latin-script Hinglish |

## Privacy rules for this recording

- Fresh demo account made at record time (fictional owner Rajesh Sharma, @sharmastore.example address). No real customer data.
- Password typed only into masked fields (dots); the show-password eye is never tapped. The password lives in .secrets/ and is never printed or narrated.
- Temporary staff passwords and share-link tokens are blurred by the in-page masker; the recorder logs any unmasked match as a leak and the take is rejected.
- Headless browser: no address bar, so no share-token URL is ever on screen. WhatsApp pop-ups are captured and closed, never shown.
- No super-admin screen, account or banner appears in this video.

## Data to seed (before recording)

Created **on camera**: the owner account (sign-up), the business "Sharma General Store" (onboarding: Retail shop, Maharashtra, Regular GST, 14 Mahatma Phule Road, Pune 411002), the customer **Ramesh Traders** (+91 98000 00101) and his entries, the GST bill, the purchase from Gupta Wholesale, one expense.

Seeded **off camera** by `pipeline/seed.mjs seedBackground()` right after onboarding, through the public API (a lived-in fortnight so the dashboard is not empty):

| What | Data |
|---|---|
| Items (opening stock 30 days ago) | Basmati Rice 5kg ₹450 (cost ₹380, 40 pcs, GST 5%, HSN 1006) · Toor Dal 1kg ₹165 (₹130, 60, 5%, 0713) · Sugar 1kg ₹48 (₹40, 12, 5%, 1701, reorder 20 → low stock) · Sunflower Oil 1L ₹155 · Tea Powder 250g ₹140 · Detergent Powder 1kg ₹95 (GST 18%) |
| Customers | Suresh Kumar (opening ₹1,850 owed, 48 days) · Anita General Store (₹4,200, 75 days) · Mohan Lal (₹650) · Priya Sweets |
| Supplier | Gupta Wholesale (GSTIN, unpaid purchase bill: Basmati ×10, Toor Dal ×20) |
| Khata entries | Suresh: gave ₹720, got ₹1,000 · Mohan: gave ₹380 · Anita: got ₹1,500 (UPI) · Priya: gave ₹2,400 |
| Bills | 8 walk-in cash/UPI sales over two weeks · Suresh (credit) · Priya (part paid ₹200 UPI) |
| Payments | Suresh ₹500 UPI |
| Expenses | Shop rent ₹8,000 cash · Electricity ₹1,840 UPI · Tea for staff ₹120 cash |
| Shop profile | UPI handle sharmastore.demo@example (reserved domain: the QR can never pay anyone), phone 98000 00100 |

## Chapters

| # | Chapter | Target | Narration |
|---|---|---|---|
| 0 | Namaste! YourKhata se miliye | 0:20 | 0:20 |
| 1 | Account banaiye | 0:25 | 0:21 |
| 2 | Dukaan ki jaankari | 0:45 | 0:42 |
| 3 | Dashboard aur menu | 0:35 | 0:32 |
| 4 | Udhaar khata | 0:55 | 0:54 |
| 5 | Yaad dilaiye (reminder) | 0:40 | 0:36 |
| 6 | Paisa aaya — payment record | 0:35 | 0:33 |
| 7 | Stock aur items | 0:30 | 0:29 |
| 8 | GST bill banaiye | 1:30 | 1:14 |
| 9 | Supplier se kharid | 0:30 | 0:28 |
| 10 | Kharche aur cashbook | 0:30 | 0:24 |
| 11 | Reports | 0:30 | 0:22 |
| 12 | Staff aur settings | 0:35 | 0:34 |
| 13 | Hindi mein bhi | 0:15 | 0:11 |
| 14 | Shukriya | 0:20 | 0:24 |

## m00 · Namaste! YourKhata se miliye (target 0:20)

**Title card:** YourKhata — **Ek platform, saara hisaab** · Bills · Stock · Payments · Collections — ek jagah

- **Problem:** Kaagaz ki khata-book, alag bill book aur stock register — hisaab bikhar jaata hai, aur baaki paisa yaad dilana mushkil hota hai.
- **Feature:** YourKhata: ek platform jahan business apna hisaab, bills, stock aur collections ek jagah rakhta hai. Aaj live module: Shop & billing.
- **Result / benefit:** Har paisa likha hua, har customer ka balance turant.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m00a | card | Namaste! YourKhata ek platform hai, jahan business apna saara hisaab — bills, stock, payments aur collections — ek hi jagah rakhta hai. | नमस्ते! यौर खाता एक प्लेटफ़ॉर्म है, जहाँ बिज़नेस अपना सारा हिसाब, बिल्स, स्टॉक, पेमेंट्स, और कलेक्शन्स, एक ही जगह रखता है। | 9.3 |
| m00b | card | Is video mein dekhiye Shop & billing module, jo aaj live hai — ek dukaan ke saath, phone par, shuru se aakhir tak. | इस वीडियो में देखिए शॉप एंड बिलिंग मॉड्यूल, जो आज लाइव है। एक दुकान के साथ, फ़ोन पर, शुरू से आख़िर तक। | 7.8 |

## m01 · Account banaiye (target 0:25)

**Title card:** Step 1 — **Account banaiye** · Sirf email aur password

- **Problem:** Naye app mein shuru karna mushkil lagta hai.
- **Feature:** Sign up: sirf email aur password.
- **UI steps:**
  1. /signup kholiye
  2. Email likhiye
  3. Password likhiye (dots mein chhupa rehta hai)
  4. Create account par tap
- **Result / benefit:** Ek minute mein account taiyaar.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m01a | card | Sabse pehle account banate hain. Iske liye sirf ek email aur password chahiye. | सबसे पहले अकाउंट बनाते हैं। इसके लिए सिर्फ़ एक ईमेल और पासवर्ड चाहिए। | 5.5 |
| m01b | screen | Apna email likhiye. | अपना ईमेल लिखिए। | 1.6 |
| m01c | screen | Ab ek mazboot password banaiye. Password hamesha chhupa rehta hai. | अब एक मज़बूत पासवर्ड बनाइए। पासवर्ड हमेशा छुपा रहता है। | 4.9 |
| m01d | screen | Create account par tap kijiye. Bas, aapka account ban gaya. | क्रिएट अकाउंट पर टैप कीजिए। बस, आपका अकाउंट बन गया। | 4.2 |

## m02 · Dukaan ki jaankari (target 0:45)

**Title card:** Step 2 — **Apni dukaan set kijiye** · Naam · kaam ka type · state · GST

- **Problem:** Har bill par dukaan ka naam, GSTIN aur pata sahi chahiye.
- **Feature:** Onboarding: chaar chhote steps; jo lagu na ho, skip.
- **UI steps:**
  1. Business name: Sharma General Store
  2. Type: Retail shop
  3. State: Maharashtra
  4. GST: Regular + GSTIN
  5. Address
  6. Start using YourKhata
- **Result / benefit:** Bill aur statement par sahi jaankari apne aap chhapti hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m02a | card | Ab apni dukaan ki jaankari bharte hain. Sirf chaar chhote steps hain. | अब अपनी दुकान की जानकारी भरते हैं। सिर्फ़ चार छोटे स्टेप्स हैं। | 4.6 |
| m02b | screen | Apna naam aur dukaan ka naam likhiye — Sharma General Store — aur business type mein Retail shop chuniye. | अपना नाम और दुकान का नाम लिखिए, शर्मा जनरल स्टोर, और बिज़नेस टाइप में रिटेल शॉप चुनिए। | 6.8 |
| m02c | screen | State chuniye — Maharashtra — aur Continue dabaiye. | स्टेट चुनिए, महाराष्ट्र, और कंटिन्यू दबाइए। | 3.3 |
| m02d | screen | GST registered hain to Regular GST chuniye aur apna GSTIN likhiye. Registered nahi hain to skip kar dijiye. | जी एस टी रजिस्टर्ड हैं, तो रेगुलर जी एस टी चुनिए, और अपना जी एस टी आई एन लिखिए। रजिस्टर्ड नहीं हैं, तो स्किप कर दीजिए। | 8.8 |
| m02e | screen | Dukaan ka pata likhiye. Ye aapke bill aur statement ke upar chhapega. | दुकान का पता लिखिए। यह आपके बिल और स्टेटमेंट के ऊपर छपेगा। | 5.0 |
| m02f | screen | Aakhri step mein YourKhata batata hai ki aapke kaam ke hisaab se kya-kya set hoga. Start par tap kijiye. | आख़िरी स्टेप में योर खाता बताता है कि आपके काम के हिसाब से क्या क्या सेट होगा। स्टार्ट पर टैप कीजिए। | 7.5 |

## m03 · Dashboard aur menu (target 0:35)

**Title card:** Step 3 — **Dashboard — ek nazar mein dukaan** · Kitna lena hai · kitna dena hai · aaj ki sale

- **Problem:** Subah-subah pata nahi hota ki kitna udhaar baaki hai aur kya khatam ho raha hai.
- **Feature:** Dashboard tiles aur side menu.
- **UI steps:**
  1. Dashboard tiles dekhiye
  2. Open menu: Daily / Business / Insight / Account
  3. Menu band
- **Result / benefit:** Ek screen par poori dukaan ki halat.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m03a | card | Ye hai aapka dashboard. Yahan ek nazar mein poori dukaan dikhti hai. | यह है आपका डैशबोर्ड। यहाँ एक नज़र में पूरी दुकान दिखती है। | 5.0 |
| m03b | screen | To collect — sabse kitna paisa lena hai. To pay — suppliers ko kitna dena hai. | टू कलेक्ट, यानी सबसे कितना पैसा लेना है। टू पे, यानी सप्लायर्स को कितना देना है। | 6.1 |
| m03c | screen | Aaj ki sale, galle mein cash, aur kaunsa maal khatam ho raha hai — sab yahin. | आज की सेल, गल्ले में कैश, और कौन सा माल ख़त्म हो रहा है, सब यहीं। | 5.2 |
| m03d | screen | Upar menu button se saare hisse khulte hain: Customers, Bills, Items, Purchases, Reports aur Settings. | ऊपर मेन्यू बटन से सारे हिस्से खुलते हैं। कस्टमर्स, बिल्स, आइटम्स, परचेज़, रिपोर्ट्स, और सेटिंग्स। | 7.1 |
| m03e | screen | Chaliye, pehla kaam karte hain — ek customer ka udhaar likhna. | चलिए, पहला काम करते हैं, एक कस्टमर का उधार लिखना। | 3.9 |

## m04 · Udhaar khata (target 0:55)

**Title card:** Step 4 — **Udhaar ka hisaab** · You gave · You got · balance apne aap

- **Problem:** Kaagaz par udhaar likhne mein galti hoti hai, aur customer se behas hoti hai.
- **Feature:** Customer khata: You gave / You got entries, running balance.
- **UI steps:**
  1. Add party (+)
  2. Naam: Ramesh Traders, mobile
  3. Save party
  4. You gave ₹1,200 "Monthly ration"
  5. You got ₹500
  6. Balance ₹700
- **Result / benefit:** Har entry tareekh ke saath; balance hamesha sahi.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m04a | card | Problem: kaagaz par udhaar likhne mein galti hoti hai, aur baad mein behas hoti hai. YourKhata mein har entry tareekh ke saath save hoti hai. | समस्या यह है कि काग़ज़ पर उधार लिखने में ग़लती होती है, और बाद में बहस होती है। योर खाता में हर एंट्री तारीख़ के साथ सेव होती है। | 10.3 |
| m04b | screen | Plus button se naya customer jodiye. Naam likhiye — Ramesh Traders — aur mobile number. | प्लस बटन से नया कस्टमर जोड़िए। नाम लिखिए, रमेश ट्रेडर्स, और मोबाइल नंबर। | 5.6 |
| m04c | screen | Save party dabaiye. Ramesh Traders ka khata khul gaya. | सेव पार्टी दबाइए। रमेश ट्रेडर्स का खाता खुल गया। | 3.8 |
| m04d | screen | Ramesh ji ₹1,200 ka ration udhaar le gaye. "You gave" par tap kijiye, amount aur note likhiye, Save. | रमेश जी बारह सौ रुपये का राशन उधार ले गए। यू गेव पर टैप कीजिए, अमाउंट और नोट लिखिए, और सेव कीजिए। | 8.4 |
| m04e | screen | Kuch din baad unhone ₹500 de diye. Is baar "You got" par tap kijiye. | कुछ दिन बाद उन्होंने पाँच सौ रुपये दे दिए। इस बार यू गॉट पर टैप कीजिए। | 5.3 |
| m04f | screen | Result: balance apne aap ₹700 ho gaya. Har entry tareekh ke saath neeche list mein hai. | नतीजा, बैलेंस अपने आप सात सौ रुपये हो गया। हर एंट्री तारीख़ के साथ नीचे लिस्ट में है। | 6.5 |
| m04g | screen | Customer ko poora hisaab dikhana ho, to teen dots se "Statement" kholiye — har entry, running balance ke saath. | कस्टमर को पूरा हिसाब दिखाना हो, तो तीन डॉट से स्टेटमेंट खोलिए। हर एंट्री, रनिंग बैलेंस के साथ। | 7.3 |

## m05 · Yaad dilaiye (reminder) (target 0:40)

**Title card:** Step 5 — **Udhaar wapas lijiye** · WhatsApp reminder · Aging

- **Problem:** Udhaar maangna awkward lagta hai, aur bhool bhi jaate hain.
- **Feature:** Send reminder (WhatsApp/SMS) aur Aging list.
- **UI steps:**
  1. More actions → Send reminder
  2. Message preview → WhatsApp
  3. Menu → Aging: 0–30, 31–60, 61–90, 90+ din
- **Result / benefit:** Paisa jaldi wapas; pata rehta hai kisko pehle phone karna hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m05a | card | Udhaar maangna thoda awkward lagta hai. YourKhata ek polite message taiyaar kar deta hai. | उधार माँगना थोड़ा ऑकवर्ड लगता है। योर खाता एक पोलाइट मैसेज तैयार कर देता है। | 6.6 |
| m05b | screen | Teen dots wale button se "Send reminder" chuniye. Message mein naam, baaki rakam aur dukaan ka naam pehle se likha hai. | तीन डॉट वाले बटन से सेंड रिमाइंडर चुनिए। मैसेज में नाम, बाक़ी रक़म, और दुकान का नाम पहले से लिखा है। | 8.1 |
| m05c | screen | WhatsApp par tap kijiye — message seedha Ramesh ji ke number par khulta hai. Aapko sirf Send dabana hai. | व्हाट्सऐप पर टैप कीजिए। मैसेज सीधा रमेश जी के नंबर पर खुलता है। आपको सिर्फ़ सेंड दबाना है। | 7.3 |
| m05d | screen | Aging screen batati hai kiska udhaar kitne dino se pada hai. Fayda: sabse purane udhaar wale ko pehle phone kijiye, paisa jaldi wapas aayega. | एजिंग स्क्रीन बताती है किसका उधार कितने दिनों से पड़ा है। फ़ायदा, सबसे पुराने उधार वाले को पहले फ़ोन कीजिए, पैसा जल्दी वापस आएगा। | 10.1 |

## m05p · Paisa aaya — payment record (target 0:35)

**Title card:** Step 5b — **Paisa aaya? Record kijiye** · Cash · PhonePe · Google Pay · receipt

- **Problem:** Paisa milne ke baad bhi khata mein likhna bhool jaate hain, aur customer dobara maang lete hain.
- **Feature:** Record payment: mode chuniye; payment purane bill se apne aap judta hai, receipt number banta hai.
- **UI steps:**
  1. Menu → Customers → Suresh Kumar
  2. More actions → Record payment
  3. Amount ₹1,000, PhonePe
  4. Save payment
- **Result / benefit:** Khata, bill aur galla — teeno ek saath sahi.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m05pa | card | Reminder ke baad Suresh Kumar ne ₹1,000 PhonePe se bhej diye. Ise record karte hain, taaki bill aur khata dono update ho jaayein. | रिमाइंडर के बाद सुरेश कुमार ने एक हज़ार रुपये फ़ोनपे से भेज दिए। इसे रिकॉर्ड करते हैं, ताकि बिल और खाता दोनों अपडेट हो जाएँ। | 9.7 |
| m05pb | screen | Suresh Kumar ka khata kholiye, teen dots dabaiye aur "Record payment" chuniye. | सुरेश कुमार का खाता खोलिए, तीन डॉट दबाइए, और रिकॉर्ड पेमेंट चुनिए। | 5.1 |
| m05pc | screen | Amount ₹1,000 likhiye, PhonePe chuniye, aur Save payment dabaiye. | अमाउंट एक हज़ार रुपये लिखिए, फ़ोनपे चुनिए, और सेव पेमेंट दबाइए। | 4.9 |
| m05pd | screen | Ho gaya! Receipt number ban gaya aur balance kam ho gaya. Pehle baaki bill chukta hota hai; jo rakam bachi, wo advance ban kar rehti hai. | हो गया! रसीद नंबर बन गया, और बैलेंस कम हो गया। पहले बाक़ी बिल चुकता होता है। जो रक़म बची, वह एडवांस बन कर रहती है। | 9.3 |

## m06 · Stock aur items (target 0:30)

**Title card:** Step 6 — **Stock ki chinta khatam** · Items · low stock alert

- **Problem:** Maal khatam hone ka pata tab chalta hai jab customer maang leta hai.
- **Feature:** Items list, stock on hand, Low stock tab, stock movements.
- **UI steps:**
  1. Menu → Items
  2. Low tab → Sugar 1kg
  3. Item detail: stock, average cost, movements
- **Result / benefit:** Samay par order; bikri kabhi nahi rukti.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m06a | card | Maal khatam hone ka pata aksar tab chalta hai jab customer maang leta hai. Items screen ye problem hal karti hai. | माल ख़त्म होने का पता अक्सर तब चलता है, जब कस्टमर माँग लेता है। आइटम्स स्क्रीन यह समस्या हल करती है। | 8.0 |
| m06b | screen | Har item ke saath dukaan mein kitna maal hai, wo dikhta hai. Stock value bhi upar hai. | हर आइटम के साथ दुकान में कितना माल है, वह दिखता है। स्टॉक वैल्यू भी ऊपर है। | 5.8 |
| m06c | screen | "Low" tab par tap kijiye — Sugar kam hai. Ye reorder level se neeche aa gaya hai. | लो टैब पर टैप कीजिए। शुगर कम है। यह रीऑर्डर लेवल से नीचे आ गया है। | 5.4 |
| m06d | screen | Item kholne par har aana-jaana dikhta hai — opening stock, bikri aur kharid. | आइटम खोलने पर हर आना जाना दिखता है। ओपनिंग स्टॉक, बिक्री, और ख़रीद। | 5.4 |

## m07 · GST bill banaiye (target 1:30)

**Title card:** Step 7 — **GST bill — 1 minute mein** · Items · GST apne aap · part payment · WhatsApp

- **Problem:** Haath se GST bill banana dheema hai, aur tax ka hisaab galat ho sakta hai.
- **Feature:** New bill: party, items, CGST+SGST apne aap, Issue ke saath payment.
- **UI steps:**
  1. Menu → Bills → +
  2. Party: Ramesh Traders
  3. Basmati Rice 5kg × 2, Toor Dal 1kg × 3
  4. Totals: CGST + SGST
  5. Issue → ₹500 UPI
  6. Bill: UPI QR, Share on WhatsApp
- **Result / benefit:** Sahi GST bill, stock kam, baaki rakam khata mein — ek saath.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m07a | card | Haath se GST bill banana dheema hai, aur tax ka hisaab galat ho sakta hai. Dekhiye YourKhata mein kitna aasaan hai. | हाथ से जी एस टी बिल बनाना धीमा है, और टैक्स का हिसाब ग़लत हो सकता है। देखिए योर खाता में कितना आसान है। | 8.5 |
| m07b | screen | Bills mein plus dabaiye. "Party" chuniye aur Ramesh Traders dhoondiye. | बिल्स में प्लस दबाइए। पार्टी चुनिए, और रमेश ट्रेडर्स ढूँढिए। | 4.4 |
| m07c | screen | Ab item jodiye — Basmati Rice 5kg, quantity 2. Rate aur GST item se apne aap aa jaate hain. | अब आइटम जोड़िए। बासमती राइस पाँच किलो, क्वांटिटी दो। रेट और जी एस टी आइटम से अपने आप आ जाते हैं। | 8.0 |
| m07d | screen | Ek aur item — Toor Dal 1kg, quantity 3. | एक और आइटम, तूर दाल एक किलो, क्वांटिटी तीन। | 3.5 |
| m07e | screen | Neeche total dekhiye. Same state ka customer hai, isliye CGST aur SGST apne aap lag gaya. | नीचे टोटल देखिए। सेम स्टेट का कस्टमर है, इसलिए सी जी एस टी और एस जी एस टी अपने आप लग गया। | 7.6 |
| m07f | screen | Issue dabaiye. Ramesh ji abhi ₹500 UPI se de rahe hain — amount badliye, UPI chuniye. | इश्यू दबाइए। रमेश जी अभी पाँच सौ रुपये यू पी आई से दे रहे हैं। अमाउंट बदलिए, और यू पी आई चुनिए। | 7.7 |
| m07g | screen | "Received ₹500 · Issue" dabaiye. Bill ban gaya, stock kam ho gaya, aur baaki rakam Ramesh ji ke khata mein jud gayi. | रिसीव्ड पाँच सौ, इश्यू दबाइए। बिल बन गया, स्टॉक कम हो गया, और बाक़ी रक़म रमेश जी के खाते में जुड़ गई। | 7.6 |
| m07h | screen | Bill par UPI QR code bhi chhapta hai — customer scan karke turant paisa bhej sakta hai. | बिल पर यू पी आई क्यू आर कोड भी छपता है। कस्टमर स्कैन करके तुरंत पैसा भेज सकता है। | 6.6 |
| m07i | screen | "Share on WhatsApp" se bill ka link customer ko chala jaata hai. | शेयर ऑन व्हाट्सऐप से बिल का लिंक कस्टमर को चला जाता है। | 4.4 |
| m07j | screen | Customer ke phone par bill aisa dikhta hai — dukaan ka naam, items, total aur baaki rakam. Bina app ke. | कस्टमर के फ़ोन पर बिल ऐसा दिखता है। दुकान का नाम, आइटम्स, टोटल, और बाक़ी रक़म। बिना ऐप के। | 7.3 |

## m08 · Supplier se kharid (target 0:30)

**Title card:** Step 8 — **Maal kharida? Purchase bill** · Stock badhta hai · supplier ka hisaab

- **Problem:** Supplier ke bill alag file mein, aur stock haath se update karna padta hai.
- **Feature:** Purchase bill: supplier, bill number, items; record karte hi stock badhta hai.
- **UI steps:**
  1. Menu → Purchases → +
  2. Supplier: Gupta Wholesale
  3. Supplier invoice no.
  4. Sugar 1kg × 50 @ ₹40
  5. Record
- **Result / benefit:** Stock aur supplier ka baaki — dono apne aap sahi.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m08a | card | Sugar kam tha, to Gupta Wholesale se pachaas packet mangwaye. Unka bill bhi YourKhata mein daal dete hain. | शुगर कम थी, तो गुप्ता होलसेल से पचास पैकेट मँगवाए। उनका बिल भी योर खाता में डाल देते हैं। | 7.3 |
| m08b | screen | Purchases mein plus dabaiye aur supplier chuniye — Gupta Wholesale. Unka bill number bhi likhiye. | परचेज़ में प्लस दबाइए, और सप्लायर चुनिए, गुप्ता होलसेल। उनका बिल नंबर भी लिखिए। | 6.3 |
| m08c | screen | Item — Sugar 1kg, quantity 50, cost ₹40. | आइटम, शुगर एक किलो, क्वांटिटी पचास, कॉस्ट चालीस रुपये। | 4.3 |
| m08d | screen | Record dabaiye. Stock mein 50 Sugar jud gayi, aur Gupta Wholesale ka hisaab bhi likh gaya. | रिकॉर्ड दबाइए। स्टॉक में पचास शुगर जुड़ गई, और गुप्ता होलसेल का हिसाब भी लिख गया। | 6.1 |

## m09 · Kharche aur cashbook (target 0:30)

**Title card:** Step 9 — **Dukaan ke kharche** · Expense · cashbook

- **Problem:** Chhote kharche — chai, auto, bijli — kahin likhe nahi jaate, aur galla milta nahi.
- **Feature:** Add expense (category, mode) aur Cashbook.
- **UI steps:**
  1. Menu → Expenses → +
  2. ₹250, category, Cash, note "Delivery auto"
  3. Save
  4. Menu → Cashbook
- **Result / benefit:** Roz ka galla milta hai; mahine ka kharcha saaf dikhta hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m09a | card | Chai, auto, bijli ke chhote kharche aksar likhe nahi jaate. Phir shaam ko galla nahi milta. | चाय, ऑटो, बिजली के छोटे ख़र्चे अक्सर लिखे नहीं जाते। फिर शाम को गल्ला नहीं मिलता। | 6.4 |
| m09b | screen | Expenses mein plus dabaiye. Amount ₹250, category chuniye, Cash, aur note — Delivery auto. | एक्सपेंसेस में प्लस दबाइए। अमाउंट ढाई सौ रुपये, कैटेगरी चुनिए, कैश, और नोट, डिलीवरी ऑटो। | 6.9 |
| m09c | screen | Save kijiye. Ab Cashbook mein har din ka opening, aaya paisa, gaya paisa aur closing — sab milta hai. | सेव कीजिए। अब कैशबुक में हर दिन का ओपनिंग, आया पैसा, गया पैसा, और क्लोज़िंग, सब मिलता है। | 7.1 |

## m10 · Reports (target 0:30)

**Title card:** Step 10 — **Reports — CA ke liye taiyaar** · Day book · GST summary

- **Problem:** Mahine ke end mein CA ko hisaab dena bada kaam lagta hai.
- **Feature:** Reports: Day book, Sales register, GST summary, CSV export.
- **UI steps:**
  1. Menu → Reports
  2. Day book
  3. GST summary
- **Result / benefit:** Ek tap mein report; CA ko seedha bhejiye.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m10a | card | Mahine ke end mein CA ko hisaab dena ab bada kaam nahi hai. | महीने के एंड में सी ए को हिसाब देना, अब बड़ा काम नहीं है। | 4.4 |
| m10b | screen | Day book mein aaj ka har bill, payment aur kharcha kram se dikhta hai. | डे बुक में आज का हर बिल, पेमेंट, और ख़र्चा, क्रम से दिखता है। | 4.5 |
| m10c | screen | GST summary mein rate ke hisaab se tax ka poora hisaab milta hai. Download button se CSV file CA ko bhej dijiye. | जी एस टी समरी में रेट के हिसाब से टैक्स का पूरा हिसाब मिलता है। डाउनलोड बटन से सी एस वी फ़ाइल सी ए को भेज दीजिए। | 9.2 |

## m10t · Staff aur settings (target 0:35)

**Title card:** Step 10b — **Staff ko jodiye** · Har kisi ka apna login · settings

- **Problem:** Helper ko apna password dena risky hai — sab kuch khul jaata hai.
- **Feature:** Team → Add member: role ke saath alag login; temporary password ek baar dikhta hai.
- **UI steps:**
  1. Menu → Team → Add member
  2. Name Vikas, email, role Staff
  3. Create login (temporary password — blurred on screen)
  4. Menu → Settings
- **Result / benefit:** Staff sirf utna dekhe jitna zaroori; har kaam activity log mein.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m10ta | card | Dukaan par helper hai? Apna password mat dijiye. Uska alag login banaiye. | दुकान पर हेल्पर है? अपना पासवर्ड मत दीजिए। उसका अलग लॉगिन बनाइए। | 5.4 |
| m10tb | screen | Team mein "Add member" dabaiye. Naam — Vikas — email, aur role mein Staff chuniye. Create login. | टीम में ऐड मेंबर दबाइए। नाम, विकास, ईमेल, और रोल में स्टाफ़ चुनिए। क्रिएट लॉगिन। | 6.0 |
| m10tc | screen | Ek temporary password banta hai — video mein hum use chhupa rahe hain. Ise WhatsApp se Vikas ko bhejiye; pehli baar login par wo apna naya password banayega. | एक टेम्पररी पासवर्ड बनता है। वीडियो में हम उसे छुपा रहे हैं। इसे व्हाट्सऐप से विकास को भेजिए। पहली बार लॉगिन पर वह अपना नया पासवर्ड बनाएगा। | 11.3 |
| m10td | screen | Settings mein dukaan ki jaankari, bill ka rang aur logo, aur apna poora data download karne ka option hai. | सेटिंग्स में दुकान की जानकारी, बिल का रंग और लोगो, और अपना पूरा डेटा डाउनलोड करने का ऑप्शन है। | 7.4 |

## m11 · Hindi mein bhi (target 0:15)

**Title card:** Step 11 — **Hindi mein bhi chalaiye** · Language · aapka data

- **Problem:** Staff ya ghar ke log English mein comfortable nahi.
- **Feature:** Account menu → हिन्दी; Settings → Your data.
- **UI steps:**
  1. Account menu → हिन्दी
  2. Dashboard Hindi mein
  3. Wapas English
- **Result / benefit:** Jo bhasha aaye, usi mein kaam.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m11a | card | Aur haan, poora app Hindi mein bhi chalta hai. | और हाँ, पूरा ऐप हिंदी में भी चलता है। | 2.7 |
| m11b | screen | Upar profile button dabaiye aur Hindi chuniye. Poora app Hindi mein badal gaya. | ऊपर प्रोफ़ाइल बटन दबाइए, और हिंदी चुनिए। पूरा ऐप हिंदी में बदल गया। | 5.4 |

## m12 · Shukriya (target 0:20)

**Title card:** YourKhata — **Aaj hi shuru kijiye** · yourkhata.com

- **Result / benefit:** Hisaab, bills, stock aur collections — sab ek platform par.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| m12a | card | To ye tha YourKhata — ek platform, jahan aapka hisaab, bills, stock aur collections ek jagah rehte hain. | तो यह था यौर खाता। एक प्लेटफ़ॉर्म, जहाँ आपका हिसाब, बिल्स, स्टॉक, और कलेक्शन्स एक जगह रहते हैं। | 7.2 |
| m12c | card | Lending & collections, Library, Gym & fitness aur Hotel & stays modules planned hain — ye abhi app mein nahi hain. | लेंडिंग एंड कलेक्शन्स, लाइब्रेरी, जिम एंड फ़िटनेस, और होटल एंड स्टेज़ मॉड्यूल्स प्लान्ड हैं। ये अभी ऐप में नहीं हैं। | 8.1 |
| m12b | card | YourKhata ke saath apne business ka hisaab aaj hi shuru kijiye. Dhanyavaad! | यौर खाता के साथ अपने बिज़नेस का हिसाब आज ही शुरू कीजिए। धन्यवाद! | 5.4 |

