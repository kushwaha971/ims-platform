# YourKhata admin console — operator guide (PRIVATE)

YourKhata is one platform where a business keeps its records, bills, stock and collections in one place (live module: Shop & billing). This private guide covers every implemented super-admin capability (PLT-14 / WLB-02 read side): tenant list and detail, plan / entitlement / limit overrides, suspend and activate, consented support access and the support session, partners and health — each shown with its effect on the business and its users.

| | |
|---|---|
| Format | Landscape 16:9, 1920×1080, H.264 + AAC, burned-in Hinglish captions + SRT. PRIVATE: do not upload publicly. |
| Audience | Platform operators / support staff of YourKhata only. |
| Target length | 5–7 min |
| Narration length | 4:57 (measured TTS) |
| Voice | Kokoro hm_omega (Hindi, male), speed 0.95; captions in Latin-script Hinglish |

## Privacy rules for this recording

- Private video. The operator account is a demo super admin created for the recording and deactivated afterwards; its email is shown, its password never (masked field, not narrated).
- Only the demo business Sharma General Store is opened. The tenant list is searched to that name so other (e2e test) tenants on the dev DB are not browsed; the overview tiles show counts only.
- Reasons typed are demo text. No tokens, cookies or impersonation JWTs appear (headless, no dev tools).
- The Health page shows version and email backend (console) — internal, acceptable in a private video.

## Data to seed (before recording)

Made **off camera** by `prepare()`:

| Account | How | Notes |
|---|---|---|
| Operator "Platform Support" (`support.demo@yourkhata.example`) | `pipeline/make_operator.sh` → Django `createsuperuser` (sets `is_super_admin=True`) | **Lead approval needed.** Deactivate after recording. |
| Owner Rajesh Sharma, business **Sharma General Store** | `seed.mjs newDemoOwner('admin')` + `seedBackground()` (same data as the desktop video) | Plan = partner default (**Unlimited**, partner Metis Labs). |
| Staff Vikas | created by the owner via `POST /members` | So "Members: 2 of …" is realistic. |

What changes **on camera** (and is reverted in the same video): plan Unlimited → Free with member-limit override 2 → back to plan default; status Active → Suspended → Active; one support-access request allowed and ended.

## Chapters

| # | Chapter | Target | Narration |
|---|---|---|---|
| 0 | Admin console kya hai | 0:25 | 0:41 |
| 1 | Login aur businesses ki list | 0:50 | 0:38 |
| 2 | Business ki detail | 0:40 | 0:22 |
| 3 | Plan aur limit override | 1:10 | 0:44 |
| 4 | Suspend aur activate | 0:55 | 0:26 |
| 5 | Owner ki ijaazat se support session | 1:20 | 1:08 |
| 6 | Partners aur health | 0:45 | 0:28 |
| 7 | Niyam yaad rakhiye | 0:25 | 0:29 |

## s00 · Admin console kya hai (target 0:25)

**Title card:** Private · Operators only — **YourKhata admin console** · Businesses · Plans · Suspend · Support access · Health

- **Problem:** Platform chalane waale ko har business ki halat, plan aur support ek jagah chahiye — bina merchant ki privacy tode.
- **Feature:** Super-admin console /admin: sirf is_super_admin users ke liye.
- **Result / benefit:** Har badlav ki wajah likhi jaati hai aur business ke activity log mein dikhti hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s00a | card | Ye video sirf YourKhata ki internal support team ke liye hai. Ise public share mat kijiye. | यह वीडियो सिर्फ़ यौर खाता की इंटरनल सपोर्ट टीम के लिए है। इसे पब्लिक शेयर मत कीजिए। | 7.2 |
| s00p | card | YourKhata ek platform hai, jahan har business apna hisaab, bills, stock aur collections ek jagah rakhta hai. Aaj live module hai Shop & billing. | यौर खाता एक प्लेटफ़ॉर्म है, जहाँ हर बिज़नेस अपना हिसाब, बिल्स, स्टॉक, और कलेक्शन्स एक जगह रखता है। आज लाइव मॉड्यूल है शॉप एंड बिलिंग। | 10.9 |
| s00b | card | Hum dekhenge: businesses ki list, plan aur limit badalna, suspend karna, owner ki ijaazat se support session, partners aur system health. | हम देखेंगे, बिज़नेसेज़ की लिस्ट, प्लान और लिमिट बदलना, सस्पेंड करना, ओनर की इजाज़त से सपोर्ट सेशन, पार्टनर्स, और सिस्टम हेल्थ। | 10.4 |
| s00c | card | Hum operator ka console dikhayenge, aur beech-beech mein owner ki screen par jaakar dekhenge ki badlav ka asar kya hua. | हम ऑपरेटर का कंसोल दिखाएँगे, और बीच बीच में ओनर की स्क्रीन पर जाकर देखेंगे कि बदलाव का असर क्या हुआ। | 8.6 |

## s01 · Login aur businesses ki list (target 0:50)

**Title card:** Part 1 — **Saare businesses, ek list** · Search · status tiles · usage

- **Problem:** Merchant phone karta hai — "mera account" — aur operator ko turant uska business dhoondhna hai.
- **Feature:** Admin console → Businesses: status tiles, search by name, GSTIN, owner email or id; plan · partner, usage, last activity.
- **UI steps:**
  1. Login as the operator (masked password)
  2. Open /admin → Businesses
  3. Tiles: Businesses, Active, Suspended, Pending deletion, Partners
  4. Search by the owner email (blurred on screen)
  5. Open Sharma General Store
- **Result / benefit:** Sekundon mein sahi business; kaun active, kaun suspended, ek nazar mein.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s01a | screen | Operator apne super-admin account se login karta hai. Ye console sirf unhi logon ko dikhta hai jinke account par super-admin flag laga ho. | ऑपरेटर अपने सुपर एडमिन अकाउंट से लॉगिन करता है। यह कंसोल सिर्फ़ उन्हीं लोगों को दिखता है, जिनके अकाउंट पर सुपर एडमिन फ़्लैग लगा हो। | 11.1 |
| s01b | screen | Upar tiles batati hain kitne businesses hain, kitne active, kitne suspended, aur kitne delete hone waale. | ऊपर टाइल्स बताती हैं कितने बिज़नेसेज़ हैं, कितने एक्टिव, कितने सस्पेंडेड, और कितने डिलीट होने वाले। | 7.7 |
| s01c | screen | Search mein naam, GSTIN, owner ka email ya id — kuch bhi likhiye. Hum owner ke email se dhoondhte hain (video mein email chhupaya gaya hai). | सर्च में नाम, जी एस टी आई एन, ओनर का ईमेल, या आई डी, कुछ भी लिखिए। हम ओनर के ईमेल से ढूँढते हैं। | 8.2 |
| s01d | screen | Har line mein plan, partner, kitne members aur parties, aur aakhri activity. Business kholte hain. | हर लाइन में प्लान, पार्टनर, कितने मेंबर्स और पार्टीज़, और आख़िरी एक्टिविटी। बिज़नेस खोलते हैं। | 7.2 |

## s02 · Business ki detail (target 0:40)

**Title card:** Part 2 — **Ek business, poori tasveer** · Profile · plan · limits · modules · owners · activity

- **Problem:** Support ko samajhna hai ki business kis plan par hai, limit kahan tak pahunchi, aur haal mein kya hua.
- **Feature:** Tenant detail: Profile (status, owners, GSTIN, partner), Plan with member / storage usage, Modules, Support access, Recent activity.
- **UI steps:**
  1. Profile card
  2. Plan: Unlimited · Members 2 of unlimited
  3. Modules
  4. Support access: none
  5. Recent activity
- **Result / benefit:** Bina merchant ka data khole, sahi jaankari.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s02a | screen | Profile mein status, owner, GSTIN aur partner. Plan card mein members aur storage ka use, limit ke saamne. | प्रोफ़ाइल में स्टेटस, ओनर, जी एस टी आई एन, और पार्टनर। प्लान कार्ड में मेंबर्स और स्टोरेज का यूज़, लिमिट के सामने। | 9.0 |
| s02b | screen | Modules batate hain business mein kya-kya chalu hai. Neeche "Recent activity" — aur dhyan dijiye, yahan customers ya bills nahi dikhte. | मॉड्यूल्स बताते हैं बिज़नेस में क्या क्या चालू है। नीचे रीसेंट एक्टिविटी। और ध्यान दीजिए, यहाँ कस्टमर्स या बिल्स नहीं दिखते। | 9.8 |

## s03 · Plan aur limit override (target 1:10)

**Title card:** Part 3 — **Plan, entitlement aur limits** · Plan badliye · member limit override · wajah zaroori

- **Problem:** Merchant ko zyada staff chahiye, ya plan badalna hai — aur ye badlav turant lagu hona chahiye.
- **Feature:** Plan & status dialog: Plan, Member limit override, Storage override (MB), Reason (required, min 5 chars) → Save changes; logged in the business's activity log.
- **UI steps:**
  1. Plan & status
  2. Plan → Free; Member limit override 2
  3. Reason → Save changes
  4. Owner: Settings → Plan shows Free, Members 2 of 2
  5. Owner: Team → Add member → "Plan limit reached"
  6. Operator: clear override, plan back to Unlimited
- **Result / benefit:** Limit turant lagti hai; owner ko Settings → Plan mein naya plan dikhta hai, aur limit par pahunchne par saaf message.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s03a | screen | "Plan & status" kholiye. Plan ko Free karte hain, aur member limit override 2 rakhte hain. | प्लान एंड स्टेटस खोलिए। प्लान को फ़्री करते हैं, और मेंबर लिमिट ओवरराइड दो रखते हैं। | 6.3 |
| s03b | screen | Har badlav ke saath wajah likhna zaroori hai. Save changes — ye business ke activity log mein bhi jaata hai. | हर बदलाव के साथ वजह लिखना ज़रूरी है। सेव चेंजेस। यह बिज़नेस के एक्टिविटी लॉग में भी जाता है। | 8.2 |
| s03c | screen | Ab owner ki screen. Settings mein "Your plan" par Free plan, aur members 2 mein se 2 — limit poori. | अब ओनर की स्क्रीन। सेटिंग्स में योर प्लान पर फ़्री प्लान, और मेंबर्स दो में से दो। लिमिट पूरी। | 6.8 |
| s03d | screen | Owner teesra member jodne ki koshish karta hai. "Create login" dabate hi saaf message aata hai ki plan ki limit poori ho gayi hai. | ओनर तीसरा मेंबर जोड़ने की कोशिश करता है। क्रिएट लॉगिन दबाते ही साफ़ मैसेज आता है कि प्लान की लिमिट पूरी हो गई है। | 9.7 |
| s03e | screen | Wapas console mein override hata kar plan Unlimited kar dete hain. Owner ke liye limit turant khul jaati hai. | वापस कंसोल में ओवरराइड हटा कर प्लान अनलिमिटेड कर देते हैं। ओनर के लिए लिमिट तुरंत खुल जाती है। | 8.3 |

## s04 · Suspend aur activate (target 0:55)

**Title card:** Part 4 — **Suspend aur activate** · Business band · data surakshit · wapas chalu

- **Problem:** Kabhi business ko turant rokna padta hai — payment dispute, misuse ki shikayat — bina data mitaaye.
- **Feature:** Plan & status → Status: Suspended (reason required) → owner and staff cannot open the business; → Active restores it. Nothing is deleted.
- **UI steps:**
  1. Plan & status → Status Suspended → reason → Save changes
  2. Owner reloads → business unavailable ("This business is suspended. Contact support.")
  3. Operator → Status Active → Save changes
  4. Owner reloads → works, data intact
- **Result / benefit:** Turant rok, pura data surakshit, ek click mein wapas.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s04a | screen | Status ko Suspended kijiye, wajah likhiye, Save changes. | स्टेटस को सस्पेंडेड कीजिए, वजह लिखिए, सेव चेंजेस। | 4.1 |
| s04b | screen | Owner ki taraf refresh kijiye: dashboard ka data ab load nahi hota, screen par error aata hai — business band hai. Data mita nahi hai, sirf band hai. | ओनर की तरफ़ रिफ़्रेश कीजिए। डैशबोर्ड का डेटा अब लोड नहीं होता, स्क्रीन पर एरर आता है। बिज़नेस बंद है। डेटा मिटा नहीं है, सिर्फ़ बंद है। | 11.0 |
| s04c | screen | Console mein status wapas Active. Owner refresh karta hai — sab kuch pehle jaisa, ek bhi entry kam nahi. | कंसोल में स्टेटस वापस एक्टिव। ओनर रिफ़्रेश करता है। सब कुछ पहले जैसा, एक भी एंट्री कम नहीं। | 7.8 |

## s05 · Owner ki ijaazat se support session (target 1:20)

**Title card:** Part 5 — **Support access — owner ki ijaazat se** · Request · Allow for 24 hours · Enter business · End session

- **Problem:** Merchant kehta hai "balance galat dikh raha hai". Support ko andar dekhna hai — par merchant ki ijaazat ke bina kabhi nahi.
- **Feature:** Request access (reason) → owners are notified → owner allows for 24 hours in Settings → Your data → operator Enter business (reason) → support session (max 60 min) with a banner; sensitive actions blocked; owner can end access any time; everything in the activity log.
- **UI steps:**
  1. Operator: Request access → reason → Send request
  2. Owner: bell notification → Settings → Your data → Support access → Allow for 24 hours
  3. Operator: Enter business → reason → banner "Support session — … acting in Sharma General Store"
  4. Team → Add member is disabled (view-only session)
  5. End session
  6. Owner: Activity log shows the support session; End access now
- **Result / benefit:** Samasya jaldi hal, aur merchant ka bharosa bana rehta hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s05a | screen | Pehle "Request access" — wajah likhiye aur Send request. Bina owner ki ijaazat ke "Enter business" chalta hi nahi. | पहले रिक्वेस्ट एक्सेस। वजह लिखिए, और सेंड रिक्वेस्ट। बिना ओनर की इजाज़त के, एंटर बिज़नेस चलता ही नहीं। | 8.2 |
| s05b | screen | Owner ko app mein notification milta hai. Settings, Your data, Support access mein request dikhti hai — "Allow for 24 hours". | ओनर को ऐप में नोटिफ़िकेशन मिलता है। सेटिंग्स, योर डेटा, सपोर्ट एक्सेस में रिक्वेस्ट दिखती है। अलाउ फ़ॉर ट्वेंटी फ़ोर आवर्स। | 10.0 |
| s05c | screen | Ab operator "Enter business" dabata hai, phir se wajah likhta hai. Session zyada se zyada 60 minute ka hota hai. | अब ऑपरेटर एंटर बिज़नेस दबाता है, फिर से वजह लिखता है। सेशन ज़्यादा से ज़्यादा साठ मिनट का होता है। | 8.5 |
| s05d | screen | Upar banner hamesha dikhata hai ki ye support session hai, kiska, aur kab khatam hoga. Operator khata dekh kar problem samajh sakta hai. | ऊपर बैनर हमेशा दिखाता है कि यह सपोर्ट सेशन है, किसका, और कब ख़त्म होगा। ऑपरेटर खाता देख कर समस्या समझ सकता है। | 10.0 |
| s05e | screen | Ye session sirf dekhne ke liye hai — "view only". Operator koi entry ya setting nahi badal sakta; jaise Team mein "Add member" band hai. | यह सेशन सिर्फ़ देखने के लिए है, व्यू ओन्ली। ऑपरेटर कोई एंट्री या सेटिंग नहीं बदल सकता। जैसे टीम में ऐड मेंबर बंद है। | 9.6 |
| s05f | screen | Kaam ho gaya to banner se "End session". Operator wapas apne console mein. | काम हो गया, तो बैनर से एंड सेशन। ऑपरेटर वापस अपने कंसोल में। | 5.3 |
| s05g | screen | Owner ke activity log mein support session ka poora record hai. Aur owner kabhi bhi "End access now" se ijaazat wapas le sakta hai. | ओनर के एक्टिविटी लॉग में सपोर्ट सेशन का पूरा रिकॉर्ड है। और ओनर कभी भी एंड एक्सेस नाउ से इजाज़त वापस ले सकता है। | 10.1 |

## s06 · Partners aur health (target 0:45)

**Title card:** Part 6 — **Partners aur system health** · Default plan · database · scheduler · jobs

- **Problem:** Kaunsa partner kitne businesses laata hai, aur kya system theek chal raha hai?
- **Feature:** Partners: default plan and business count (edited in the platform admin). Health: database latency, storage, scheduler heartbeat, background jobs (queued, running, failed 24 h), version; refreshes every 30 s.
- **UI steps:**
  1. Console → Partners
  2. Console → Health: Database · Storage · Scheduler · Background jobs · Refresh
- **Result / benefit:** Problem merchant se pehle operator ko dikh jaati hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s06a | screen | Partners mein har partner ka default plan aur uske businesses ki ginti. Naye business ko partner ka default plan milta hai. | पार्टनर्स में हर पार्टनर का डिफ़ॉल्ट प्लान, और उसके बिज़नेसेज़ की गिनती। नए बिज़नेस को पार्टनर का डिफ़ॉल्ट प्लान मिलता है। | 9.5 |
| s06b | screen | Health page par database, storage, scheduler aur jobs ki queue — har 30 second mein refresh. Is demo server par job runner band hai, isliye Scheduler "Problem" dikha raha hai — aisi gadbad yahin sabse pehle dikhti hai. | हेल्थ पेज पर डेटाबेस, स्टोरेज, शेड्यूलर, और जॉब्स की क्यू। हर तीस सेकंड में रिफ़्रेश। इस डेमो सर्वर पर जॉब रनर बंद है, इसलिए शेड्यूलर प्रॉब्लम दिखा रहा है। ऐसी गड़बड़ यहीं सबसे पहले दिखती है। | 15.5 |

## s07 · Niyam yaad rakhiye (target 0:25)

**Title card:** Private · Operators only — **Teen niyam** · Wajah likhiye · ijaazat ke bina andar nahi · kaam khatam, session khatam

- **Result / benefit:** Merchant ka bharosa hi platform ki asli poonji hai.

| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |
|---|---|---|---|---|
| s07a | card | Teen niyam: har badlav ki wajah likhiye; owner ki ijaazat ke bina kabhi andar mat jaaiye; aur kaam khatam hote hi session band kijiye. | तीन नियम। हर बदलाव की वजह लिखिए। ओनर की इजाज़त के बिना कभी अंदर मत जाइए। और काम ख़त्म होते ही सेशन बंद कीजिए। | 10.0 |
| s07c | card | Lending & collections, Library, Gym & fitness aur Hotel & stays modules planned hain — ye abhi console ya app mein nahi hain. | लेंडिंग एंड कलेक्शन्स, लाइब्रेरी, जिम एंड फ़िटनेस, और होटल एंड स्टेज़ मॉड्यूल्स प्लान्ड हैं। ये अभी कंसोल या ऐप में नहीं हैं। | 9.6 |
| s07b | card | Ye sab business ke activity log mein hamesha ke liye dikhta hai. Dhanyavaad. | यह सब बिज़नेस के एक्टिविटी लॉग में हमेशा के लिए दिखता है। धन्यवाद। | 5.8 |

