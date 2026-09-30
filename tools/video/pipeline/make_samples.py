import sys, time; sys.path.insert(0, 'pipeline')
from pathlib import Path
import tts
S = Path('samples')
LATIN = "Namaste! Is video mein hum dekhenge ki YourKhata se aap apni dukaan ka hisaab kaise rakh sakte hain — udhaar, bill, stock aur GST, sab ek jagah. Invoice banaiye, dashboard par aaj ki bikri dekhiye."
DEVA_MIXED = "नमस्ते! इस वीडियो में हम देखेंगे कि YourKhata से आप अपनी दुकान का हिसाब कैसे रख सकते हैं — उधार, बिल, स्टॉक और GST, सब एक जगह। invoice बनाइए, dashboard पर आज की बिक्री देखिए।"
DEVA = "नमस्ते! इस वीडियो में हम देखेंगे कि यॉरखाता से आप अपनी दुकान का हिसाब कैसे रख सकते हैं — उधार, बिल, स्टॉक और जी एस टी, सब एक जगह। इनवॉइस बनाइए, डैशबोर्ड पर आज की बिक्री देखिए।"
jobs = [
  ('kokoro_hf_alpha_devanagari.wav', DEVA, 'hf_alpha', 'hi', True),
  ('kokoro_hf_beta_devanagari.wav', DEVA, 'hf_beta', 'hi', True),
  ('kokoro_hm_omega_devanagari.wav', DEVA, 'hm_omega', 'hi', True),
  ('kokoro_hm_psi_devanagari.wav', DEVA, 'hm_psi', 'hi', True),
  ('kokoro_hf_alpha_devanagari_mixed_latin_ui_words.wav', DEVA_MIXED, 'hf_alpha', 'hi', False),
  ('kokoro_hf_alpha_latin_hinglish.wav', LATIN, 'hf_alpha', 'hi', True),
  ('kokoro_af_heart_latin_hinglish_en.wav', LATIN, 'af_heart', 'en-us', True),
]
for name, text, v, lang, raw in jobs:
    t=time.time(); d = tts.synth(text, S/name, voice=v, lang=lang, raw=raw)
    print(f'{name}: {d:.2f}s audio in {time.time()-t:.1f}s')
