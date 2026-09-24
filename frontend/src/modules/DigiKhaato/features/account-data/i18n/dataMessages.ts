import type { Locale } from 'src/types/domain.types';

/**
 * PLT-10 — the words only the "Your data" page renders, in both languages,
 * loaded with `/settings/data` alone by `AccountDataIntlProvider`.
 *
 * Not in `locales/*.json` because the shell imports `en.json` statically and
 * every key there ships to every route (~2 KB gz of deletion and export prose
 * on /login, measured). What stays in the shell catalogue is what can appear
 * OUTSIDE this page: the pending-deletion banner, and every id the global
 * snackbar resolves (success toasts and the thunks' error fallbacks).
 * `dataMessages.test.ts` keeps the two languages in step, the job
 * `check-locales.mjs` does for the shell catalogue.
 */
const EN: Readonly<Record<string, string>> = {
  'data.cancel.body': 'The deletion is cancelled and everyone can work as before.',
  'data.cancel.confirm': 'Keep the business',
  'data.cancel.keep': 'Go back',
  'data.cancel.title': 'Keep this business?',
  'data.delete.action': 'Delete business',
  'data.delete.body':
    'The business becomes read-only at once and is deleted after {days} days. You can cancel any time before then.',
  'data.delete.confirm.label': 'Type {name} to confirm',
  'data.delete.confirm.mismatch': 'Name does not match.',
  'data.delete.confirm.required': 'Type the business name.',
  'data.delete.consequence.coolOff':
    'Everything is deleted after {days} days. Until then you can cancel from this page.',
  'data.delete.consequence.gst':
    'GST law asks you to keep invoices and books for 6 years. Keep the downloaded file — it is your copy.',
  'data.delete.consequence.readOnly':
    'Nobody can add or change anything from now on. Your team is signed out.',
  'data.delete.consequence.removed':
    "Parties, khata, items, expenses, messages and the team's access are removed. A final copy is kept for you for 30 days.",
  'data.delete.dialog.submit': 'Delete business',
  'data.delete.dialog.submitting': 'Requesting…',
  'data.delete.dialog.title': 'Delete this business?',
  'data.delete.exportFirst': 'Download your data first — after your latest changes.',
  'data.delete.password.label': 'Your password',
  'data.delete.password.placeholder': 'The password you sign in with',
  'data.delete.password.required': 'Enter your password.',
  'data.delete.pending.countdown':
    '{days, plural, one {# day left} other {# days left}} to change your mind.',
  'data.delete.pending.title': 'This business will be deleted on {date}',
  'data.delete.reason.label': 'Why are you leaving? (optional)',
  'data.delete.reason.placeholder': 'e.g. Closing the shop',
  'data.delete.title': 'Delete this business',
  'data.error.title': 'Your data could not be loaded',
  'data.export.body':
    'A ZIP of CSV files: parties, khata entries, items and stock, expenses, messages, team, activity log and settings, with your logo and signature. Ready in a few minutes; the link works for 7 days.',
  'data.export.download': 'Download',
  'data.export.empty': "You haven't downloaded your data yet.",
  'data.export.preparing': 'Preparing…',
  'data.export.row.ready':
    '{rows, plural, one {# row} other {# rows}} · {size} · link works until {expires}',
  'data.export.row.started': 'Started {when}',
  'data.export.start': 'Download all data',
  'data.export.status.expired': 'Expired',
  'data.export.status.failed': 'Failed',
  'data.export.status.queued': 'Waiting',
  'data.export.status.running': 'Preparing',
  'data.export.status.succeeded': 'Ready',
  'data.export.title': 'Download all your data',
  'data.ownerOnly.body':
    "Downloading all data, support access and deleting the business are the owner's decisions.",
  'data.ownerOnly.title': 'Only the owner can open this page',
  'data.subtitle': 'Take a copy of everything, let support in for a day, or delete this business.',
  'data.support.allow': 'Allow for 24 hours',
  'data.support.body':
    'Support can look into your business only after you allow it here. Permission lasts 24 hours, support can only read, and everything they open is in your activity log.',
  'data.support.deny': 'Deny',
  'data.support.empty': 'No requests from support.',
  'data.support.revoke': 'End access now',
  'data.support.row.granted': 'Allowed until {until}',
  'data.support.row.inSession': 'Support is in your business now, until {until}',
  'data.support.row.requested': 'Asked by {who} on {when}',
  'data.support.status.denied': 'Denied',
  'data.support.status.expired': 'Expired',
  'data.support.status.granted': 'Allowed',
  'data.support.status.requested': 'Waiting for you',
  'data.support.status.revoked': 'Ended',
  'data.support.team': 'Support',
  'data.support.title': 'Support access',
  'data.title': 'Your data',
};

const HI: Readonly<Record<string, string>> = {
  'data.cancel.body': 'हटाना रद्द हो जाता है और सब पहले की तरह काम कर सकते हैं।',
  'data.cancel.confirm': 'बिज़नेस रखें',
  'data.cancel.keep': 'वापस जाएँ',
  'data.cancel.title': 'यह बिज़नेस रखें?',
  'data.delete.action': 'बिज़नेस हटाएँ',
  'data.delete.body':
    'बिज़नेस तुरंत केवल-पढ़ने योग्य हो जाता है और {days} दिन बाद हटा दिया जाता है। उससे पहले आप कभी भी रद्द कर सकते हैं।',
  'data.delete.confirm.label': 'पुष्टि के लिए {name} लिखें',
  'data.delete.confirm.mismatch': 'नाम मेल नहीं खाता।',
  'data.delete.confirm.required': 'बिज़नेस का नाम लिखें।',
  'data.delete.consequence.coolOff':
    '{days} दिन बाद सब कुछ हटा दिया जाता है। तब तक आप इस पेज से रद्द कर सकते हैं।',
  'data.delete.consequence.gst':
    'GST कानून के अनुसार बिल और बही 6 साल रखनी होती हैं। डाउनलोड की गई फ़ाइल रखें — यह आपकी कॉपी है।',
  'data.delete.consequence.readOnly':
    'अब से कोई कुछ जोड़ या बदल नहीं सकता। आपकी टीम साइन आउट हो जाती है।',
  'data.delete.consequence.removed':
    'पार्टियाँ, खाता, आइटम, खर्च, संदेश और टीम का एक्सेस हटा दिया जाता है। आपके लिए एक आख़िरी कॉपी 30 दिन रखी जाती है।',
  'data.delete.dialog.submit': 'बिज़नेस हटाएँ',
  'data.delete.dialog.submitting': 'अनुरोध हो रहा है…',
  'data.delete.dialog.title': 'यह बिज़नेस हटाएँ?',
  'data.delete.exportFirst': 'पहले अपना डेटा डाउनलोड करें — अपने आख़िरी बदलावों के बाद।',
  'data.delete.password.label': 'आपका पासवर्ड',
  'data.delete.password.placeholder': 'वह पासवर्ड जिससे आप साइन इन करते हैं',
  'data.delete.password.required': 'अपना पासवर्ड डालें।',
  'data.delete.pending.countdown':
    'मन बदलने के लिए {days, plural, one {# दिन बाकी} other {# दिन बाकी}}।',
  'data.delete.pending.title': 'यह बिज़नेस {date} को हटा दिया जाएगा',
  'data.delete.reason.label': 'आप क्यों जा रहे हैं? (वैकल्पिक)',
  'data.delete.reason.placeholder': 'जैसे दुकान बंद कर रहे हैं',
  'data.delete.title': 'यह बिज़नेस हटाएँ',
  'data.error.title': 'आपका डेटा लोड नहीं हो सका',
  'data.export.body':
    'CSV फ़ाइलों का एक ZIP: पार्टियाँ, खाता एंट्री, आइटम और स्टॉक, खर्च, संदेश, टीम, गतिविधि लॉग और सेटिंग्स, आपके लोगो और हस्ताक्षर के साथ। कुछ मिनटों में तैयार; लिंक 7 दिन चलता है।',
  'data.export.download': 'डाउनलोड',
  'data.export.empty': 'आपने अभी तक अपना डेटा डाउनलोड नहीं किया है।',
  'data.export.preparing': 'तैयार हो रहा है…',
  'data.export.row.ready':
    '{rows, plural, one {# पंक्ति} other {# पंक्तियाँ}} · {size} · लिंक {expires} तक चलेगा',
  'data.export.row.started': '{when} को शुरू हुआ',
  'data.export.start': 'सारा डेटा डाउनलोड करें',
  'data.export.status.expired': 'समाप्त',
  'data.export.status.failed': 'विफल',
  'data.export.status.queued': 'प्रतीक्षा में',
  'data.export.status.running': 'तैयार हो रहा है',
  'data.export.status.succeeded': 'तैयार',
  'data.export.title': 'अपना सारा डेटा डाउनलोड करें',
  'data.ownerOnly.body':
    'सारा डेटा डाउनलोड करना, सपोर्ट एक्सेस और बिज़नेस हटाना मालिक के फ़ैसले हैं।',
  'data.ownerOnly.title': 'यह पेज केवल मालिक खोल सकते हैं',
  'data.subtitle': 'सब कुछ की कॉपी लें, सपोर्ट को एक दिन के लिए आने दें, या यह बिज़नेस हटाएँ।',
  'data.support.allow': '24 घंटे के लिए अनुमति दें',
  'data.support.body':
    'सपोर्ट आपके बिज़नेस को तभी देख सकता है जब आप यहाँ अनुमति दें। अनुमति 24 घंटे चलती है, सपोर्ट केवल देख सकता है, और वे जो भी खोलते हैं वह आपके गतिविधि लॉग में है।',
  'data.support.deny': 'मना करें',
  'data.support.empty': 'सपोर्ट से कोई अनुरोध नहीं।',
  'data.support.revoke': 'एक्सेस अभी बंद करें',
  'data.support.row.granted': '{until} तक अनुमति',
  'data.support.row.inSession': 'सपोर्ट अभी आपके बिज़नेस में है, {until} तक',
  'data.support.row.requested': '{who} ने {when} को पूछा',
  'data.support.status.denied': 'मना किया',
  'data.support.status.expired': 'समाप्त',
  'data.support.status.granted': 'अनुमति दी',
  'data.support.status.requested': 'आपकी प्रतीक्षा',
  'data.support.status.revoked': 'बंद किया',
  'data.support.team': 'सपोर्ट',
  'data.support.title': 'सपोर्ट एक्सेस',
  'data.title': 'आपका डेटा',
};

export const DATA_MESSAGES: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: EN,
  hi: HI,
};
