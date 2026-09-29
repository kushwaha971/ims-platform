# YourKhata logo concepts, round 3: the K with khata styling

> **Outcome (29 Sep 2026): the owner chose K-c, Bandhan.** It is applied app-wide under CR-2026-09-29-BRAND-C (see `docs/DESIGN-SYSTEM.md` §7). The files here are kept, unchanged, as the concept record; the text below is as it was written for the review.

The owner asked to "keep the K like the 1st logo (Concept 1, Signature K), but with some khata styling." These are four variants of that K. Each one keeps the Concept 1 letter (DM Sans 600 with the leg sweeping into a ruled line) and adds one bahi-khata idea. None of them is applied to the app, and nothing here is committed.

Files for each variant (`a`, `b`, `c`, `d`):

- `k-X-mark.svg` is the 64 × 64 tile.
- `k-X-lockup.svg` is the tile plus the "YourKhata" wordmark. The wordmark is DM Sans 600 outlined to paths, so it needs no font. The K is in indigo `#4A47D6`.
- `k-X-mark-16.svg` is a hand-cut 16 px version on a 16-unit grid. Its stems and rules sit on whole pixels.

Preview sheets:

- `/tmp/e2e-shots/brand/concepts3.png` shows Concept 1 as the reference, then each variant at 128, 48, 32 and 16 px, the 16 px cut at ×3, one colour, the lockup, the dark rail and a home-screen icon.
- `/tmp/e2e-shots/brand/concepts3-in-context.png` shows the sidebar header, the phone top bar and the browser-tab favicon, each in light and dark.

The palette is the app's primary ramp in `src/styles/tokens/light.css`. "Bahi red" `#C8322B` appears only in variants a and c, and it is never used for text. All contrast figures are WCAG 2.x ratios. All text passes 4.5:1: the ink wordmark is 19.9:1 on white, the indigo K is 6.6:1 on white, the dark-rail K (`#9D9AF0`) is 7.0:1 on `#121922`, and the dark-rail ink is 16.3:1.

---

## K-a · Likhai (the written page)

The tile is a khata page: a pale indigo sheet with two faint ruled lines and a red margin rule. The K is written on the page in indigo ink, and its sweep underlines the total.

| Role | Hex | Check |
|---|---|---|
| Page tile | `#F1F0FE` (primary-50) | |
| K ink | `#3A36B8` (primary-600) | 7.8:1 on the page |
| Ruled lines and tile edge | `#C6C4F9` (primary-200) | Decorative |
| Margin rule | `#C8322B` bahi red | 4.7:1 on the page |

- **Strengths:** this is the most literal "ledger page" of the four, and the K is exactly the Concept 1 letter. It is the only light tile, so it stands out on a dark rail and on a phone home screen.
- **Risks:** the pale tile needs its hairline edge to hold its shape on a white sidebar, and the in-context sheet shows it is weaker there. At 16 px the margin and the rule are single pixels, so they read as texture. The one-colour version is busy. A light tile does not keep the solid indigo block that the app uses today.

## K-b · Silaai (the stitched spine)

The K's stem is the ledger's spine. It runs the full height of the book, and a column of stitch holes runs down it. Two fanned lines behind the upper arm are the pages opening off the spine.

| Role | Hex | Check |
|---|---|---|
| Tile | `#4A47D6` (primary-500) | White on the tile 6.6:1 |
| Pages | `#9D9AF0` (primary-300) | 2.6:1, decorative |

- **Strengths:** it keeps the solid indigo tile of Concept 1. The stitched spine is an idea no other brand in the category uses. The 16 px cut keeps three stitch holes.
- **Risks:** the holes can read as a ruler or a film strip. The fanned page lines look like "speed lines" at 32 px and below, so they are dropped from the 16 px cut.

## K-c · Bandhan (the tied bahi cover)

The tile is the cloth cover of a bahi-khata, recoloured deep indigo, with a stitched hem. The K's sweep keeps going across the whole cover as the tie band, and a small bahi-red knot with two white string ends closes it. In the wordmark, a red knot dot ends the sweep under "hata".

| Role | Hex | Check |
|---|---|---|
| Cover tile | `#3A36B8` (primary-600) | White on the cover 8.8:1 |
| Hem | `#716DE4` (primary-400) | 2.1:1, decorative |
| Knot | `#C8322B` bahi red | 5.3:1 on the white band |

- **Strengths:** of the four, this is the version that most clearly reads as the tied red ledger, and the knot gives the family a small, ownable signature. White on this tile has the highest contrast of the four.
- **Risks:** it has the most detail. The hem and the knot shrink to near-noise at 24 px and below, and at 16 px the knot reads as a red dot. Bahi red sits close to the app's debit red `--error` `#CC1C1C`, so it must stay decorative.

## K-d · Barabar (built from ledger rules)

The K is redrawn from ledger strokes. The stem is a column rule running down through the foot. The two arms are equal-length entries, "diya" (white) and "liya" (primary-200), meeting at the rule, so the account is balanced. A double underline closes the balance, and the wordmark repeats it under "Khata".

| Role | Hex | Check |
|---|---|---|
| Tile | `#4A47D6` (primary-500) | White on the tile 6.6:1 |
| "Liya" arm | `#C6C4F9` (primary-200) | 4.0:1 on the tile |

- **Strengths:** it is the cleanest geometry and the crispest 16 px cut. The double underline is the accountant's "closing balance" sign, and it carries the meaning without needing red.
- **Risks:** it moves furthest from the Concept 1 letter, because the sweep is replaced by the double rule. The double-barred foot may remind some people of the Lao kip sign (₭) or of a generic "K with underline".

---

## Recommendation

**K-c, Bandhan**, with **K-a, Likhai** as the runner-up.

K-c keeps the Concept 1 K and its sweep, and turns that sweep into the tie of a bahi-khata. That is the most direct answer to "the same K, but khata". If the owner finds the knot too busy at small sizes, the fallback is K-b's solid indigo tile with the stitched spine.
