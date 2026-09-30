# YourKhata desktop guide — ek platform: Shop & billing step by step

YourKhata is one platform where a business keeps its records, bills, stock and collections in one place. This is a step-by-step guide to its live module, Shop & billing, running Sharma General Store on a computer. Planned modules are named once, as planned, in the closing card (no UI, no dates). Each chapter opens with the business problem, then shows the exact clicks, then the result.

| | |
|---|---|
| Format | Landscape 16:9, 1920×1080 (browser 1440×810 CSS at 4/3 scale, i.e. text 1.33× larger than a plain 1080p screen), H.264 + AAC, burned-in Hinglish captions + SRT, YouTube chapters |
| Audience | Shop owners, accountants and staff who work on a laptop/desktop (public: clients/users, YouTube). Non-technical. |
| Target length | 10–14 min |
| Narration length | 9:34 (measured TTS) |
| Voice | Kokoro hm_omega (Hindi, male), speed 0.95; captions in Latin-script Hinglish |

## Privacy rules for this recording

- Demo owner made through the API just before recording (fictional Rajesh Sharma, rajesh.d<n>@sharmastore.example). Password typed into the masked field only.
- Staff temporary password (Team chapter) is blurred by the masker ([data-testid=credentials-password], copy-message); the take is rejected if the recorder logs a leak.
- Share links: the WhatsApp pop-up is captured and closed; the customer page is opened in the same chrome-less page, so the /d/<token> URL never appears.
- No super-admin console, account, "Support" banner or admin credentials in this video.

## Data to seed (before recording)

Made **off camera** by `prepare()` (`pipeline/seed.mjs`): owner Rajesh Sharma with a finished business **Sharma General Store** (Retail shop, Maharashtra 27, Regular GST with an invented checksum-valid GSTIN, 14 Mahatma Phule Road, Pune 411002, UPI sharmastore.demo@example), then `seedBackground(skip: Ramesh Traders)`: the same items, customers (Suresh Kumar, Anita General Store, Mohan Lal, Priya Sweets), supplier **Gupta Wholesale**, khata entries, a fortnight of bills, one payment and three expenses as in the mobile video.

Created **on camera**: customer **Ramesh Traders** with his khata entries and a wrong entry that is corrected; the GST bill for Ramesh (Basmati Rice 5kg ×2, Toor Dal 1kg ×3); an estimate for Priya Sweets converted to a bill; a return (credit note) of 1 Toor Dal from Suresh; a payment from Suresh; a purchase bill from Gupta Wholesale (Sugar 1kg ×50 @ ₹40) and its payment; one expense; a CSV import of three customers (`pipeline/assets/customers.csv`: Kiran Provision, Deepak Dairy, Farida Bakers); staff member Vikas.

## Chapters

| # | Chapter | Target | Narration |
|---|---|---|---|
| 0 | Intro — YourKhata kya hai | 0:25 | 0:29 |
| 1 | Login aur dashboard | 0:50 | 0:46 |
| 2 | Business profile aur branding | 0:45 | 0:25 |
| 3 | Customer aur udhaar khata | 1:20 | 0:54 |
| 4 | Statement, reminder aur aging | 1:00 | 0:40 |
| 5 | Items aur stock | 1:00 | 0:39 |
| 6 | GST bill banaiye | 1:40 | 1:18 |
| 7 | Estimate aur return | 1:00 | 0:34 |
| 8 | Payment record kijiye | 0:45 | 0:24 |
| 9 | Kharid aur supplier payment | 1:00 | 0:35 |
| 10 | Kharche aur cashbook | 0:45 | 0:19 |
| 11 | Reports aur GST | 1:15 | 0:47 |
| 12 | Purana data import | 0:45 | 0:32 |
| 13 | Team, activity log aur aapka data | 0:50 | 0:36 |
| 14 | Hindi mein chalaiye | 0:20 | 0:09 |
| 15 | Shukriya | 0:25 | 0:28 |

## d00 · Intro — YourKhata kya hai (target 0:25)

**Title card:** YourKhata — **Ek platform, saara hisaab — computer par** · Shop & billing: Udhaar · Stock · GST bill · Payments · Reports

- **Problem:** Kaagaz ki khata-book, alag bill book aur stock register — teeno milaana mushkil.
- **Feature:** YourKhata: ek platform jahan business apna hisaab, bills, stock aur collections ek jagah rakhta hai. Aaj live module: Shop & billing (khata, stock, GST billing, kharid, kharche, reports).
- **Result / benefit:** Har rupaye ka hisaab, har samay sahi.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d00a | card | Namaste! YourKhata ek platform hai, jahan business apna saara hisaab — bills, stock, payments aur collections — ek hi jagah rakhta hai. | नमस्ते! यौर खाता एक प्लेटफ़ॉर्म है, जहाँ बिज़नेस अपना सारा हिसाब, बिल्स, स्टॉक, पेमेंट्स, और कलेक्शन्स, एक ही जगह रखता है। | 10.0 |
| d00c | card | Is guide mein hum step by step Shop & billing module dekhenge, jo aaj live hai — computer par. | इस गाइड में हम स्टेप बाय स्टेप शॉप एंड बिलिंग मॉड्यूल देखेंगे, जो आज लाइव है, कंप्यूटर पर। | 7.2 |
| d00b | card | Hamari demo dukaan hai Sharma General Store. Chapters neeche description mein hain — jo kaam chahiye, seedha wahan jaaiye. | हमारी डेमो दुकान है शर्मा जनरल स्टोर। चैप्टर्स नीचे डिस्क्रिप्शन में हैं। जो काम चाहिए, सीधा वहाँ जाइए। | 8.4 |

## d01 · Login aur dashboard (target 0:50)

**Title card:** Chapter 1 — **Login aur dashboard** · Subah ki pehli nazar

- **Problem:** Din shuru karte hi pata nahi hota ki kitna udhaar baaki hai, kitna dena hai, aur kya khatam ho raha hai.
- **Feature:** Dashboard tiles: To collect, To pay, Due today, Overdue, Today's sales, Cash in hand, Low stock; sidebar menu.
- **UI steps:**
  1. Login: email + password (masked)
  2. Dashboard tiles
  3. Recent activity · Who owes most · Running low
  4. Sidebar: Daily / Business / Insight / Account
  5. Top search: customers and suppliers
- **Result / benefit:** Ek screen par poori dukaan ki halat; har tile click karke list khulti hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d01a | screen | Apna email aur password daal kar Log in kijiye. Password hamesha dots mein chhupa rehta hai. | अपना ईमेल और पासवर्ड डाल कर लॉग इन कीजिए। पासवर्ड हमेशा डॉट्स में छुपा रहता है। | 7.1 |
| d01b | screen | Ye dashboard hai. "To collect" batata hai ki customers se kitna lena hai, aur "To pay" ki suppliers ko kitna dena hai. | यह डैशबोर्ड है। टू कलेक्ट बताता है कि कस्टमर्स से कितना लेना है, और टू पे, कि सप्लायर्स को कितना देना है। | 8.6 |
| d01c | screen | Aaj ki sale, galle mein cash aur low stock bhi yahin hai. Kisi bhi tile par click kijiye — poori list khul jaati hai. | आज की सेल, गल्ले में कैश, और लो स्टॉक भी यहीं है। किसी भी टाइल पर क्लिक कीजिए, पूरी लिस्ट खुल जाती है। | 8.1 |
| d01d | screen | Neeche Recent activity, sabse zyada udhaar wale customers, aur khatam hota maal dikhta hai. | नीचे रीसेंट एक्टिविटी, सबसे ज़्यादा उधार वाले कस्टमर्स, और ख़त्म होता माल दिखता है। | 7.2 |
| d01e | screen | Baayein menu mein roz ke kaam, business, reports aur settings hain. Upar search se kisi bhi customer ya supplier tak turant pahunchiye. | बाएँ मेन्यू में रोज़ के काम, बिज़नेस, रिपोर्ट्स, और सेटिंग्स हैं। ऊपर सर्च से किसी भी कस्टमर या सप्लायर तक तुरंत पहुँचिए। | 9.7 |

## d02 · Business profile aur branding (target 0:45)

**Title card:** Chapter 2 — **Bill par sahi jaankari** · Business profile · Branding

- **Problem:** Bill par GSTIN, pata ya UPI galat ho to customer aur CA dono pareshaan.
- **Feature:** Settings → Business profile (naam, GST, pata, bank, UPI) with bill header preview; Branding (logo, rang, bill ki lines).
- **UI steps:**
  1. Sidebar → Settings
  2. Business profile: GSTIN, address, UPI — Bill header preview
  3. Branding: brand colour, Save changes
- **Result / benefit:** Ek baar bhariye — har bill, statement aur receipt par apne aap.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d02a | screen | Settings mein "Business profile" kholiye. Dukaan ka naam, GSTIN, pata aur UPI yahan ek hi baar bharna hota hai. | सेटिंग्स में बिज़नेस प्रोफ़ाइल खोलिए। दुकान का नाम, जी एस टी आई एन, पता, और यू पी आई, यहाँ एक ही बार भरना होता है। | 9.5 |
| d02b | screen | Side mein "Bill header preview" dikhata hai ki aapke bill ke upar kya chhapega. | साइड में बिल हेडर प्रीव्यू दिखाता है कि आपके बिल के ऊपर क्या छपेगा। | 5.4 |
| d02c | screen | Branding mein apna logo aur rang chuniye — bill aur customer page usi rang mein dikhenge. | ब्रांडिंग में अपना लोगो और रंग चुनिए। बिल और कस्टमर पेज उसी रंग में दिखेंगे। | 6.3 |

## d03 · Customer aur udhaar khata (target 1:20)

**Title card:** Chapter 3 — **Udhaar khata** · Customer jodiye · You gave / You got · galti sudhaariye

- **Problem:** Kaagaz par udhaar mein galti hoti hai, aur "maine itna nahi liya tha" wali behas hoti hai.
- **Feature:** Add party; khata with You gave / You got; running balance; wrong entry → Correct (the original stays visible, struck through).
- **UI steps:**
  1. Customers → Add party
  2. Name Ramesh Traders, mobile 98000 00101 → Save party
  3. You gave ₹1,200 "Monthly ration" → Save
  4. You got ₹5,000 (typo) → Save
  5. Entry ⋯ → Correct → ₹500, reason → Save
  6. Balance ₹700; "Show corrections" reveals the audit trail
- **Result / benefit:** Har entry tareekh aur note ke saath; galti sudhaarne par bhi record saaf rehta hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d03a | screen | Customers list mein har customer ka balance dikhta hai. Upar ke chips se sirf "Owes me" ya "I owe them" filter kijiye. | कस्टमर्स लिस्ट में हर कस्टमर का बैलेंस दिखता है। ऊपर के चिप्स से सिर्फ़ ओज़ मी, या आई ओ देम, फ़िल्टर कीजिए। | 8.3 |
| d03b | screen | Naya customer: "Add party" dabaiye, naam Ramesh Traders aur mobile number likhiye, phir Save party. | नया कस्टमर। ऐड पार्टी दबाइए, नाम रमेश ट्रेडर्स, और मोबाइल नंबर लिखिए, फिर सेव पार्टी। | 7.3 |
| d03c | screen | Ramesh ji ₹1,200 ka ration udhaar le gaye. "You gave" dabaiye, amount aur note likhiye, Save. | रमेश जी बारह सौ रुपये का राशन उधार ले गए। यू गेव दबाइए, अमाउंट और नोट लिखिए, सेव। | 7.3 |
| d03d | screen | Unhone ₹500 diye, par jaldi mein hamne ₹5,000 likh diya. Aisi galti roz hoti hai. | उन्होंने पाँच सौ रुपये दिए, पर जल्दी में हमने पाँच हज़ार लिख दिया। ऐसी ग़लती रोज़ होती है। | 7.1 |
| d03e | screen | Entry ke teen dots se "Correct" chuniye, sahi amount ₹500 aur wajah likhiye. Purani entry mitti nahi — record ke liye kati hui rehti hai. | एंट्री के तीन डॉट से करेक्ट चुनिए, सही अमाउंट पाँच सौ रुपये और वजह लिखिए। पुरानी एंट्री मिटती नहीं, रिकॉर्ड के लिए कटी हुई रहती है। | 10.4 |
| d03f | screen | Result: balance sahi ₹700. "Show corrections" on karne par poori history dikhti hai — kisne, kab, kya badla. | नतीजा, बैलेंस सही सात सौ रुपये। शो करेक्शन्स ऑन करने पर पूरी हिस्ट्री दिखती है। किसने, कब, क्या बदला। | 8.2 |

## d04 · Statement, reminder aur aging (target 1:00)

**Title card:** Chapter 4 — **Udhaar wapas laaiye** · Statement · WhatsApp reminder · Aging

- **Problem:** Customer maanta nahi ki itna baaki hai; aur yaad dilana bhool jaate hain.
- **Feature:** Statement with running balance (print / CSV); Send reminder on WhatsApp; Reminders buckets; Aging by 0–30 / 31–60 / 61–90 / 90+ days.
- **UI steps:**
  1. Khata → More actions → Statement
  2. Print / Export
  3. More actions → Send reminder → WhatsApp
  4. Sidebar → Reminders (Due today / Overdue / Upcoming / Sent)
  5. Sidebar → Aging
- **Result / benefit:** Saboot saamne, polite reminder ek click mein, aur pata ki kisko pehle phone karna hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d04a | screen | "Statement" kholiye. Passbook ki tarah har entry aur running balance — isko print kijiye ya customer ko bhejiye. | स्टेटमेंट खोलिए। पासबुक की तरह हर एंट्री और रनिंग बैलेंस। इसको प्रिंट कीजिए, या कस्टमर को भेजिए। | 7.8 |
| d04b | screen | "Send reminder" se ek polite message taiyaar milta hai — naam, baaki rakam aur dukaan ka naam ke saath. WhatsApp par click, aur bhej dijiye. | सेंड रिमाइंडर से एक पोलाइट मैसेज तैयार मिलता है। नाम, बाक़ी रक़म, और दुकान का नाम के साथ। व्हाट्सऐप पर क्लिक, और भेज दीजिए। | 10.3 |
| d04c | screen | Reminders page par dikhta hai kiska paisa aaj aana hai, kiska late ho gaya, aur kisko reminder ja chuka hai. | रिमाइंडर्स पेज पर दिखता है, किसका पैसा आज आना है, किसका लेट हो गया, और किसको रिमाइंडर जा चुका है। | 7.9 |
| d04d | screen | Aging report udhaar ko umar ke hisaab se baantti hai. 90 din se purana paisa sabse zyada risk mein hai — wahan pehle phone kijiye. | एजिंग रिपोर्ट उधार को उम्र के हिसाब से बाँटती है। नब्बे दिन से पुराना पैसा सबसे ज़्यादा रिस्क में है। वहाँ पहले फ़ोन कीजिए। | 10.1 |

## d05 · Items aur stock (target 1:00)

**Title card:** Chapter 5 — **Stock ki poori khabar** · Items · Adjust stock · Low stock · Stock summary

- **Problem:** Maal khatam hone ka pata tab chalta hai jab customer maang leta hai; toot-phoot ka hisaab nahi rehta.
- **Feature:** Items with price, GST, HSN, reorder point; stock movements; Adjust stock (damage/count difference); Low stock; Stock summary at average cost.
- **UI steps:**
  1. Sidebar → Items
  2. Open Basmati Rice 5kg: stock, average cost, movements
  3. Adjust stock → Damage, −2
  4. Low stock
  5. Stock summary
- **Result / benefit:** Stock aur uski value hamesha sahi; order samay par.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d05a | screen | Items mein har cheez ka selling price, GST aur dukaan mein bacha stock dikhta hai. Upar poore stock ki value bhi. | आइटम्स में हर चीज़ का सेलिंग प्राइस, जी एस टी, और दुकान में बचा स्टॉक दिखता है। ऊपर पूरे स्टॉक की वैल्यू भी। | 8.4 |
| d05b | screen | Basmati Rice kholiye. Stock, average cost, aur har aana-jaana — opening, bikri, kharid — ek list mein. | बासमती राइस खोलिए। स्टॉक, एवरेज कॉस्ट, और हर आना जाना, ओपनिंग, बिक्री, ख़रीद, एक लिस्ट में। | 7.5 |
| d05c | screen | Do bori bheeg kar kharab ho gayi? "Adjust stock" mein reason Damage chuniye, quantity minus 2, aur Post adjustment. | दो बोरी भीग कर ख़राब हो गई? एडजस्ट स्टॉक में रीज़न, डैमेज चुनिए, क्वांटिटी माइनस दो, और पोस्ट एडजस्टमेंट। | 8.8 |
| d05d | screen | Low stock report batata hai ki kya reorder level se neeche hai — jaise Sugar. Stock summary mein poore maal ki value average cost par milti hai. | लो स्टॉक रिपोर्ट बताती है कि क्या रीऑर्डर लेवल से नीचे है, जैसे शुगर। स्टॉक समरी में पूरे माल की वैल्यू एवरेज कॉस्ट पर मिलती है। | 10.5 |

## d06 · GST bill banaiye (target 1:40)

**Title card:** Chapter 6 — **GST bill — sahi aur tez** · Items · CGST/SGST apne aap · payment · print · share

- **Problem:** Haath se GST bill banana dheema hai; tax ka hisaab galat ho sakta hai; stock aur khata alag se update karna padta hai.
- **Feature:** New bill: party, items, rate and GST from the item, CGST+SGST (or IGST) by place of supply; Issue with payment; A4 / 80 mm print; UPI QR; Share on WhatsApp; customer page.
- **UI steps:**
  1. Bills → New bill
  2. Party → Ramesh Traders
  3. Basmati Rice 5kg × 2, Toor Dal 1kg × 3
  4. Totals: Taxable, CGST 2.5%, SGST 2.5%
  5. Issue → payment ₹500 Google Pay → Received ₹500 · Issue
  6. Print A4 / 80 mm · UPI QR
  7. Share on WhatsApp → customer view
- **Result / benefit:** Ek click mein sahi GST bill — stock kam, khata mein baaki, customer ke paas link.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d06a | screen | Bills mein "New bill" dabaiye. Walk-in ke liye seedha items, udhaar customer ke liye "Party" chuniye — Ramesh Traders. | बिल्स में न्यू बिल दबाइए। वॉक इन के लिए सीधा आइटम्स, उधार कस्टमर के लिए पार्टी चुनिए, रमेश ट्रेडर्स। | 8.3 |
| d06b | screen | Item mein "Basm" likhiye aur Basmati Rice 5kg chuniye, quantity 2. Rate aur GST item se apne aap bhar jaate hain. | आइटम में बास लिखिए, और बासमती राइस पाँच किलो चुनिए, क्वांटिटी दो। रेट और जी एस टी आइटम से अपने आप भर जाते हैं। | 9.7 |
| d06c | screen | "Add item" se doosri line — Toor Dal 1kg, quantity 3. | ऐड आइटम से दूसरी लाइन, तूर दाल एक किलो, क्वांटिटी तीन। | 4.7 |
| d06d | screen | Totals dekhiye: taxable value, CGST aur SGST alag-alag. Customer doosre state ka hota, to IGST apne aap lagta. | टोटल्स देखिए। टैक्सेबल वैल्यू, सी जी एस टी, और एस जी एस टी, अलग अलग। कस्टमर दूसरे स्टेट का होता, तो आई जी एस टी अपने आप लगता। | 10.8 |
| d06e | screen | "Issue" dabaiye. Ramesh ji abhi ₹500 Google Pay se de rahe hain — amount aur mode chuniye, phir "Received ₹500 · Issue". | इश्यू दबाइए। रमेश जी अभी पाँच सौ रुपये गूगल पे से दे रहे हैं। अमाउंट और मोड चुनिए, फिर रिसीव्ड पाँच सौ, इश्यू। | 9.3 |
| d06f | screen | Bill taiyaar! Stock kam ho gaya, aur baaki rakam Ramesh ji ke khata mein jud gayi. Print A4 ya 80 mm thermal — dono hain. | बिल तैयार! स्टॉक कम हो गया, और बाक़ी रक़म रमेश जी के खाते में जुड़ गई। प्रिंट ए फ़ोर, या अस्सी एम एम थर्मल, दोनों हैं। | 9.4 |
| d06g | screen | Bill par UPI QR chhapta hai — customer scan karke turant pay kar sakta hai, aur rakam shabdon mein bhi likhi hoti hai. | बिल पर यू पी आई क्यू आर छपता है। कस्टमर स्कैन करके तुरंत पे कर सकता है, और रक़म शब्दों में भी लिखी होती है। | 8.9 |
| d06h | screen | "Share on WhatsApp" se bill ka link jaata hai. Customer ko bina app ke aisa page dikhta hai — sirf aapki dukaan ke naam ke saath. | शेयर ऑन व्हाट्सऐप से बिल का लिंक जाता है। कस्टमर को बिना ऐप के ऐसा पेज दिखता है, सिर्फ़ आपकी दुकान के नाम के साथ। | 9.5 |

## d07 · Estimate aur return (target 1:00)

**Title card:** Chapter 7 — **Estimate aur maal wapsi** · Estimate se bill · Credit note

- **Problem:** Bade order se pehle customer rate poochta hai; aur kabhi maal wapas aata hai — dono ka hisaab bigadta hai.
- **Feature:** Estimate (Save & send, then Convert to bill); Return items on a bill → credit note that reduces the balance and puts stock back.
- **UI steps:**
  1. Bills → Estimates → New estimate: Priya Sweets, Sugar 1kg × 10 → Save & send
  2. Estimate → Convert to invoice
  3. Open Suresh Kumar's bill → Return items: Toor Dal 1kg × 1 → credit note
- **Result / benefit:** Quote se bill ek click mein; wapsi ka GST aur stock dono sahi.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d07a | screen | Priya Sweets ne das kilo cheeni ka rate poocha. "New estimate" banaiye, item daaliye aur "Save & send". | प्रिया स्वीट्स ने दस किलो चीनी का रेट पूछा। न्यू एस्टिमेट बनाइए, आइटम डालिए, और सेव एंड सेंड। | 7.7 |
| d07b | screen | Customer maan gaya? Estimate par "Convert to invoice" dabaiye — saari lines naye bill mein aa jaati hain. | कस्टमर मान गया? एस्टिमेट पर कन्वर्ट टू इनवॉइस दबाइए। सारी लाइन्स नए बिल में आ जाती हैं। | 7.4 |
| d07c | screen | Suresh ji ek Toor Dal wapas laaye. Unka bill kholiye, "Return items" chuniye aur quantity 1. | सुरेश जी एक तूर दाल वापस लाए। उनका बिल खोलिए, रिटर्न आइटम्स चुनिए, और क्वांटिटी एक। | 7.1 |
| d07d | screen | Save karte hi credit note ban jaata hai: Suresh ji ka balance kam, aur Toor Dal wapas stock mein. | सेव करते ही क्रेडिट नोट बन जाता है। सुरेश जी का बैलेंस कम, और तूर दाल वापस स्टॉक में। | 7.1 |

## d08 · Payment record kijiye (target 0:45)

**Title card:** Chapter 8 — **Paisa aaya — payment** · Cash · UPI · bank · receipt

- **Problem:** Paisa aa gaya par bill "unpaid" hi dikhta raha — customer se galti se dobara maang liya.
- **Feature:** Payments → Record payment: Received/Paid out, party, mode, amount; allocated to the oldest bills; receipt.
- **UI steps:**
  1. Sidebar → Payments → Record payment
  2. Received from Suresh Kumar
  3. PhonePe ₹1,000
  4. Save payment
  5. Receipt RCT/…
- **Result / benefit:** Bill, khata aur cashbook ek saath update; receipt number ke saath saboot.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d08a | screen | Payments mein "Record payment" dabaiye. Received chuniye aur customer — Suresh Kumar. | पेमेंट्स में रिकॉर्ड पेमेंट दबाइए। रिसीव्ड चुनिए, और कस्टमर, सुरेश कुमार। | 5.6 |
| d08b | screen | PhonePe chuniye, amount ₹1,000, aur Save payment. | फ़ोनपे चुनिए, अमाउंट एक हज़ार रुपये, और सेव पेमेंट। | 4.1 |
| d08c | screen | Receipt number ban gaya. Pehle baaki bill chukta hota hai; bachi rakam advance ban kar rehti hai. Suresh ji ka khata bhi update ho gaya. | रसीद नंबर बन गया। पहले बाक़ी बिल चुकता होता है। बची रक़म एडवांस बन कर रहती है। सुरेश जी का खाता भी अपडेट हो गया। | 10.6 |

## d09 · Kharid aur supplier payment (target 1:00)

**Title card:** Chapter 9 — **Supplier se kharid** · Purchase bill · stock badhta hai · Pay supplier

- **Problem:** Supplier ke bill file mein pade rehte hain; stock haath se badhana padta hai; kitna dena hai yaad nahi.
- **Feature:** Purchases → New bill (supplier, supplier invoice no., items, cost, GST) → Record; Pay supplier.
- **UI steps:**
  1. Sidebar → Purchases → New bill
  2. Supplier Gupta Wholesale, invoice GW-2291
  3. Sugar 1kg × 50 @ ₹40 (before GST)
  4. Record (paid now → bill Paid)
  5. Purchases → Unpaid → older Gupta bill → Pay supplier → Bank
- **Result / benefit:** Stock, average cost aur supplier ka baaki — sab apne aap; input GST report mein.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d09a | screen | Sugar kam tha, to Gupta Wholesale se 50 packet aaye. Purchases mein "New bill", supplier chuniye aur unka bill number likhiye. | शुगर कम थी, तो गुप्ता होलसेल से पचास पैकेट आए। परचेज़ में न्यू बिल, सप्लायर चुनिए, और उनका बिल नंबर लिखिए। | 9.0 |
| d09b | screen | Item — Sugar 1kg, quantity 50, cost ₹40, GST se pehle. | आइटम, शुगर एक किलो, क्वांटिटी पचास, कॉस्ट चालीस रुपये, जी एस टी से पहले। | 6.2 |
| d09c | screen | "Record" dabaiye. Stock mein 50 Sugar jud gayi. Paisa abhi de diya, to bill wahin "Paid" ho jaata hai. | रिकॉर्ड दबाइए। स्टॉक में पचास शुगर जुड़ गई। पैसा अभी दे दिया, तो बिल वहीं पेड हो जाता है। | 7.2 |
| d09d | screen | Pichhla bill abhi baaki hai? Purchases mein "Unpaid" bill kholiye aur "Pay supplier" se bank ya UPI payment likhiye. | पिछला बिल अभी बाक़ी है? परचेज़ में अनपेड बिल खोलिए, और पे सप्लायर से बैंक या यू पी आई पेमेंट लिखिए। | 8.4 |

## d10 · Kharche aur cashbook (target 0:45)

**Title card:** Chapter 10 — **Kharche aur galla** · Expenses · Cashbook

- **Problem:** Chhote kharche likhe nahi jaate, aur shaam ko galla nahi milta.
- **Feature:** Expenses → Add expense (category, paid by, note); Cashbook: opening, money in, money out, closing per day; Cash vs Bank & UPI.
- **UI steps:**
  1. Sidebar → Expenses → Add expense
  2. ₹250, category, Cash, note "Delivery auto" → Save
  3. Sidebar → Cashbook
  4. Filter Cash / Bank & UPI
- **Result / benefit:** Roz ka galla milta hai; mahine ka kharcha category-wise.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d10a | screen | "Add expense" dabaiye: amount ₹250, category, Cash, aur note — Delivery auto. Save. | ऐड एक्सपेंस दबाइए। अमाउंट ढाई सौ रुपये, कैटेगरी, कैश, और नोट, डिलीवरी ऑटो। सेव। | 7.0 |
| d10b | screen | Cashbook mein har din ka opening, aaya paisa, gaya paisa aur closing. Cash aur Bank-UPI alag bhi dekh sakte hain. | कैशबुक में हर दिन का ओपनिंग, आया पैसा, गया पैसा, और क्लोज़िंग। कैश और बैंक यू पी आई अलग भी देख सकते हैं। | 8.8 |

## d11 · Reports aur GST (target 1:15)

**Title card:** Chapter 11 — **Reports — CA ke liye taiyaar** · Day book · Registers · GST summary · Export

- **Problem:** Mahine ke end mein CA ke liye bill, kharid aur GST ka hisaab jodna poora din le leta hai.
- **Feature:** Reports hub: Day book, Receivables/Payables aging, Stock summary, Sales register, Purchase register, GST summary (by rate, HSN, B2B/B2C); Export CSV on every report.
- **UI steps:**
  1. Sidebar → Reports
  2. Day book
  3. Sales register (B2B / B2C)
  4. GST summary: This month
  5. Export
- **Result / benefit:** Ek click mein report; CSV seedha CA ko.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d11a | screen | Reports mein saari reports ek jagah hain — paisa, customer-supplier, stock, aur sales-GST. | रिपोर्ट्स में सारी रिपोर्ट्स एक जगह हैं। पैसा, कस्टमर सप्लायर, स्टॉक, और सेल्स जी एस टी। | 6.6 |
| d11b | screen | Day book mein din ka har bill, payment aur kharcha samay ke kram se — cash aur bank ke saath. | डे बुक में दिन का हर बिल, पेमेंट, और ख़र्चा, समय के क्रम से। कैश और बैंक के साथ। | 6.3 |
| d11c | screen | Sales register mein har bill ka taxable value, CGST, SGST aur IGST. B2B aur B2C ke liye alag filter bhi hai. | सेल्स रजिस्टर में हर बिल का टैक्सेबल वैल्यू, सी जी एस टी, एस जी एस टी, और आई जी एस टी। बी टू बी और बी टू सी के लिए अलग फ़िल्टर भी है। | 10.9 |
| d11d | screen | GST summary mein rate ke hisaab se outward aur inward tax, HSN summary, aur bill series — GST return bharne ke liye taiyaar. | जी एस टी समरी में रेट के हिसाब से आउटवर्ड और इनवर्ड टैक्स, एच एस एन समरी, और बिल सीरीज़। जी एस टी रिटर्न भरने के लिए तैयार। | 10.9 |
| d11e | screen | Har report par "Export" hai — CSV file download karke seedha CA ko bhej dijiye. | हर रिपोर्ट पर एक्सपोर्ट है। सी एस वी फ़ाइल डाउनलोड करके सीधा सी ए को भेज दीजिए। | 6.8 |

## d12 · Purana data import (target 0:45)

**Title card:** Chapter 12 — **Purani book, ek file mein** · CSV import · export

- **Problem:** Purane customers aur unka baaki ek-ek karke likhna ghanton ka kaam hai.
- **Feature:** Import data: download template → fill → Choose → check rows → import; Export on lists.
- **UI steps:**
  1. Customers → Import (or /imports)
  2. Download template
  3. Customers → Choose → customers.csv
  4. Row check (server job) → Import 3 customers
  5. Go to customers: list updated
- **Result / benefit:** Minutes mein poori purani book app mein.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d12a | screen | Purane customers Excel mein hain? Import mein pehle template download kijiye, usme naam, mobile aur baaki bhariye. | पुराने कस्टमर्स एक्सेल में हैं? इम्पोर्ट में पहले टेम्पलेट डाउनलोड कीजिए, उसमें नाम, मोबाइल, और बाक़ी भरिए। | 8.8 |
| d12b | screen | Customers ke saamne "Choose" dabaiye aur apni CSV file chuniye. YourKhata har line check karta hai, aur galti wali line pehle hi bata deta hai. | कस्टमर्स के सामने चूज़ दबाइए, और अपनी सी एस वी फ़ाइल चुनिए। यौर खाता हर लाइन चेक करता है, और ग़लती वाली लाइन पहले ही बता देता है। | 11.0 |
| d12c | screen | Sab theek hai, to "Import 3 customers" dabaiye. Teen naye customers unke purane baaki ke saath list mein aa gaye. | सब ठीक है, तो इम्पोर्ट थ्री कस्टमर्स दबाइए। तीन नए कस्टमर्स उनके पुराने बाक़ी के साथ लिस्ट में आ गए। | 8.2 |

## d13 · Team, activity log aur aapka data (target 0:50)

**Title card:** Chapter 13 — **Team aur suraksha** · Staff login · Activity log · Your data

- **Problem:** Staff ko apna password dena risky hai; aur pata nahi chalta kisne kya badla.
- **Feature:** Team → Add member (role: Admin / Staff / Accountant; temporary password shown once); Activity log; Your data: download everything, support access only with your permission.
- **UI steps:**
  1. Sidebar → Team → Add member: Vikas, email, Staff → Create login
  2. Temporary password (blurred) → send on WhatsApp
  3. Settings → Activity log
  4. Settings → Your data
- **Result / benefit:** Har kisi ka apna login, har badlav ka record, aur data hamesha aapka.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d13a | screen | Team mein "Add member": naam Vikas, email, aur role Staff. Staff bill bana sakta hai, par settings nahi badal sakta. | टीम में ऐड मेंबर। नाम विकास, ईमेल, और रोल स्टाफ़। स्टाफ़ बिल बना सकता है, पर सेटिंग्स नहीं बदल सकता। | 8.0 |
| d13b | screen | "Create login" — ek temporary password sirf ek baar dikhta hai (video mein chhupaya gaya hai). Ise WhatsApp se Vikas ko bhejiye. | क्रिएट लॉगिन। एक टेम्पररी पासवर्ड सिर्फ़ एक बार दिखता है, वीडियो में छुपाया गया है। इसे व्हाट्सऐप से विकास को भेजिए। | 9.1 |
| d13c | screen | Activity log mein har kaam — kisne, kab, kya kiya — likha rehta hai. | एक्टिविटी लॉग में हर काम, किसने, कब, क्या किया, लिखा रहता है। | 4.9 |
| d13d | screen | "Your data" se poora data ek ZIP mein download kijiye. Support team bhi aapki ijaazat ke bina aapka business nahi dekh sakti. | योर डेटा से पूरा डेटा एक ज़िप में डाउनलोड कीजिए। सपोर्ट टीम भी आपकी इजाज़त के बिना आपका बिज़नेस नहीं देख सकती। | 9.8 |

## d14 · Hindi mein chalaiye (target 0:20)

**Title card:** Chapter 14 — **Hindi mein bhi** · Account menu · Hindi

- **Problem:** Staff English mein comfortable nahi.
- **Feature:** Account menu → language.
- **UI steps:**
  1. Account menu → हिन्दी
  2. Account menu → English
- **Result / benefit:** Jo bhasha aaye, usi mein kaam.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d14a | screen | Upar account menu se Hindi chuniye — poora app Hindi mein. Wapas English bhi yahin se. | ऊपर अकाउंट मेन्यू से हिंदी चुनिए। पूरा ऐप हिंदी में। वापस इंग्लिश भी यहीं से। | 6.3 |

## d15 · Shukriya (target 0:25)

**Title card:** YourKhata — **Aaj hi shuru kijiye** · yourkhata.com

- **Result / benefit:** Hisaab, bills, stock aur collections — sab ek platform par.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| d15a | card | To aapne dekha — udhaar, stock, GST bill, payment, kharid, kharche aur reports, sab ek hi jagah. | तो आपने देखा, उधार, स्टॉक, जी एस टी बिल, पेमेंट, ख़रीद, ख़र्चे, और रिपोर्ट्स, सब एक ही जगह। | 7.1 |
| d15c | card | Lending & collections, Library, Gym & fitness aur Hotel & stays modules planned hain — ye abhi app mein nahi hain. | लेंडिंग एंड कलेक्शन्स, लाइब्रेरी, जिम एंड फ़िटनेस, और होटल एंड स्टेज़ मॉड्यूल्स प्लान्ड हैं। ये अभी ऐप में नहीं हैं। | 8.7 |
| d15b | card | Video pasand aaya ho to share kijiye. YourKhata ke saath apne business ka hisaab aaj hi shuru kijiye. Dhanyavaad! | वीडियो पसंद आया हो तो शेयर कीजिए। यौर खाता के साथ अपने बिज़नेस का हिसाब आज ही शुरू कीजिए। धन्यवाद! | 9.0 |

