import { UbBox, UbLogo } from 'src/design-system';

/**
 * The auth hero — the khata, gone digital. Drawn for this product in the
 * manner of the Figma storefront (node 13504:19284): flat shapes on a
 * 648 × 435 canvas, the brand ramp for the subject on soft brand tiles.
 *
 * ── Why a book and a screen, not a shop ─────────────────────────────────────
 * The owner's call: YourKhata is a SaaS for keeping the book, not a shop, so
 * the picture is the book. A red-bound khata lies open in front with its two
 * columns — what was given, what was got — and behind it the same book as the
 * product shows it: a laptop with the balance, the totals and a ledger list,
 * and a phone carrying a reminder. A statement with a "paid" tick and a stack
 * of coins sit either side. The YourKhata mark is on the laptop's screen.
 *
 * ── White-label ───────────────────────────────────────────────────────────
 * The brand-coloured parts are `fill-primary-*`, so a tenant who rewrites the
 * ramp gets the picture in their colour. The khata's red and the coins stay
 * fixed. There is no scenery — no bushes, no lamp post — so nothing in it is
 * borrowed from the Figma's storefront drawing: only its flat manner is.
 *
 * `aria-hidden` — the headline beside it says everything it says.
 */
export function AuthHeroArt(): React.JSX.Element {
  return (
    <UbBox className="relative mx-auto w-full max-w-[648px]">
      <svg
        viewBox="0 0 648 435"
        aria-hidden
        focusable="false"
        className="block h-auto w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Backdrop: two soft brand tiles and a floor shadow — abstract,
            no scenery, so the picture is the product's own. */}
        <rect x="96" y="70" width="456" height="300" rx="36" className="fill-primary-50" />
        <rect
          x="420"
          y="40"
          width="150"
          height="110"
          rx="24"
          className="fill-primary-100"
          fillOpacity="0.7"
        />
        <rect
          x="70"
          y="250"
          width="130"
          height="120"
          rx="24"
          className="fill-primary-100"
          fillOpacity="0.7"
        />
        <ellipse cx="324" cy="404" rx="250" ry="14" fill="#0A090B" fillOpacity="0.06" />

        {/* ── The laptop: the book as the product shows it ─────────────── */}
        <g>
          <rect x="150" y="54" width="348" height="222" rx="14" fill="#2D2B32" />
          <rect x="162" y="66" width="324" height="198" rx="6" fill="#FFFFFF" />
          {/* screen: sidebar */}
          <rect x="162" y="66" width="64" height="198" rx="6" className="fill-primary-50" />
          <rect x="222" y="66" width="4" height="198" className="fill-primary-50" />
          <rect x="174" y="112" width="40" height="7" rx="3.5" className="fill-primary-200" />
          <rect x="174" y="128" width="32" height="7" rx="3.5" className="fill-primary-100" />
          <rect x="174" y="144" width="36" height="7" rx="3.5" className="fill-primary-100" />
          <rect x="174" y="160" width="28" height="7" rx="3.5" className="fill-primary-100" />
          {/* screen: header */}
          <rect x="240" y="80" width="96" height="10" rx="5" fill="#2D2B32" fillOpacity="0.85" />
          <rect x="240" y="96" width="140" height="6" rx="3" fill="#ADACB0" />
          {/* screen: two stat tiles */}
          <rect x="240" y="112" width="112" height="44" rx="6" fill="#FFFFFF" stroke="#E6E6E6" />
          <rect x="250" y="122" width="44" height="6" rx="3" fill="#ADACB0" />
          <rect x="250" y="136" width="70" height="10" rx="5" fill="#E12121" />
          <rect x="362" y="112" width="112" height="44" rx="6" fill="#FFFFFF" stroke="#E6E6E6" />
          <rect x="372" y="122" width="44" height="6" rx="3" fill="#ADACB0" />
          <rect x="372" y="136" width="58" height="10" rx="5" fill="#307F4A" />
          {/* screen: ledger rows */}
          {[168, 190, 212, 234].map((y, index) => (
            <g key={y}>
              <circle cx="250" cy={y + 6} r="6" className="fill-primary-100" />
              <rect
                x="262"
                y={y + 2}
                width={index % 2 ? 70 : 92}
                height="7"
                rx="3.5"
                fill="#4F4D55"
                fillOpacity="0.7"
              />
              <rect
                x={index % 2 ? 424 : 416}
                y={y + 2}
                width={index % 2 ? 50 : 58}
                height="7"
                rx="3.5"
                fill={index % 2 ? '#307F4A' : '#E12121'}
              />
              {index < 3 && <rect x="240" y={y + 16} width="234" height="1" fill="#E6E6E6" />}
            </g>
          ))}
          {/* base */}
          <path d="M122 276h404l-18 16H140z" fill="#4F4D55" />
          <rect x="292" y="276" width="64" height="5" rx="2.5" fill="#2D2B32" />
        </g>

        {/* ── The khata, open in front ─────────────────────────────────── */}
        <g>
          <path d="M184 392l14-104h128l2 104z" fill="#A93226" />
          <path d="M328 392l2-104h128l14 104z" fill="#A93226" />
          <path d="M194 384l12-90h118l2 90z" fill="#FFFFFF" />
          <path d="M330 384l2-90h118l12 90z" fill="#FDFBF6" />
          <rect x="324" y="286" width="8" height="106" rx="2" fill="#7B241C" />
          {/* ruled lines */}
          <g stroke="#D6E0F7" strokeWidth="1.5">
            {[312, 326, 340, 354, 368].map((y, i) => (
              <path
                key={y}
                d={`M${206 - i * 1.6} ${y}h${114 + i * 1.2}M${336} ${y}h${112 + i * 1.6}`}
              />
            ))}
          </g>
          {/* the columns' headings and a margin rule */}
          <path d="M270 298v84M392 298v84" stroke="#FAA4A4" strokeWidth="1.5" />
          <rect x="214" y="300" width="36" height="6" rx="3" fill="#E12121" />
          <rect x="342" y="300" width="36" height="6" rx="3" fill="#307F4A" />
          {/* entries */}
          <rect x="214" y="316" width="44" height="5" rx="2.5" fill="#4F4D55" fillOpacity="0.6" />
          <rect x="280" y="316" width="32" height="5" rx="2.5" fill="#E12121" fillOpacity="0.8" />
          <rect x="212" y="330" width="50" height="5" rx="2.5" fill="#4F4D55" fillOpacity="0.6" />
          <rect x="280" y="330" width="28" height="5" rx="2.5" fill="#E12121" fillOpacity="0.8" />
          <rect x="342" y="316" width="40" height="5" rx="2.5" fill="#4F4D55" fillOpacity="0.6" />
          <rect x="402" y="316" width="34" height="5" rx="2.5" fill="#307F4A" fillOpacity="0.8" />
          <rect x="342" y="344" width="46" height="5" rx="2.5" fill="#4F4D55" fillOpacity="0.6" />
          <rect x="402" y="344" width="30" height="5" rx="2.5" fill="#307F4A" fillOpacity="0.8" />
          {/* bookmark ribbon */}
          <path d="M438 284h12v34l-6-6-6 6z" fill="#F4A118" />
        </g>

        {/* ── A statement with a paid tick, left ───────────────────────── */}
        <g>
          <rect x="70" y="150" width="104" height="132" rx="8" fill="#FFFFFF" stroke="#E6E6E6" />
          <rect x="84" y="166" width="48" height="8" rx="4" className="fill-primary-500" />
          <rect x="84" y="182" width="72" height="5" rx="2.5" fill="#ADACB0" />
          {[200, 214, 228].map((y) => (
            <g key={y}>
              <rect x="84" y={y} width="44" height="5" rx="2.5" fill="#C9C9CC" />
              <rect x="136" y={y} width="24" height="5" rx="2.5" fill="#7F7D83" />
            </g>
          ))}
          <rect x="84" y="244" width="76" height="1" fill="#E6E6E6" />
          <rect x="84" y="252" width="30" height="6" rx="3" fill="#4F4D55" />
          <rect x="128" y="252" width="32" height="6" rx="3" fill="#2D2B32" />
          <circle cx="170" cy="152" r="16" fill="#307F4A" />
          <path
            d="M162 152l5.5 5.5L178 147"
            stroke="#FFFFFF"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* ── A phone with a reminder, right ───────────────────────────── */}
        <g>
          <rect x="486" y="112" width="92" height="178" rx="16" fill="#2D2B32" />
          <rect x="494" y="124" width="76" height="154" rx="9" fill="#FFFFFF" />
          <rect x="520" y="116" width="24" height="4" rx="2" fill="#4F4D55" />
          <rect x="502" y="136" width="44" height="7" rx="3.5" fill="#2D2B32" fillOpacity="0.8" />
          <rect x="502" y="156" width="58" height="34" rx="8" className="fill-primary-50" />
          <rect x="510" y="164" width="40" height="5" rx="2.5" className="fill-primary-500" />
          <rect x="510" y="175" width="30" height="5" rx="2.5" fill="#ADACB0" />
          <rect x="508" y="198" width="54" height="30" rx="8" fill="#E8F6ED" />
          <rect x="516" y="206" width="36" height="5" rx="2.5" fill="#307F4A" />
          <rect x="516" y="216" width="24" height="5" rx="2.5" fill="#ADACB0" />
          <rect x="502" y="252" width="60" height="16" rx="8" className="fill-primary-500" />
          <rect x="518" y="258" width="28" height="4" rx="2" fill="#FFFFFF" />
        </g>

        {/* ── Coins, a rupee on top ────────────────────────────────────── */}
        <g>
          <ellipse cx="514" cy="382" rx="24" ry="7" fill="#C47E0A" />
          <rect x="490" y="366" width="48" height="16" fill="#E49614" />
          <ellipse cx="514" cy="366" rx="24" ry="7" fill="#FFB945" />
          <rect x="490" y="352" width="48" height="14" fill="#E49614" />
          <ellipse cx="514" cy="352" rx="24" ry="7" fill="#FFC76A" />
          <path
            d="M505 347.5h18M505 351.2h18M509.5 347.5c5.5 0 7.5 1.7 7.5 3.7s-2 3.7-7.5 3.7l8 4.2"
            stroke="#9D6508"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </g>

        {/* ── Two floating chips: money in, a reminder sent ──────────────── */}
        <g>
          <rect x="40" y="96" width="112" height="34" rx="17" fill="#FFFFFF" stroke="#E6E6E6" />
          <circle cx="58" cy="113" r="9" fill="#E8F6ED" />
          <path
            d="M54 113l3 3 6-6"
            stroke="#307F4A"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="74" y="106" width="36" height="5" rx="2.5" fill="#4F4D55" fillOpacity="0.7" />
          <rect x="74" y="116" width="58" height="5" rx="2.5" fill="#307F4A" />
        </g>
        <g>
          <rect x="500" y="306" width="116" height="34" rx="17" fill="#FFFFFF" stroke="#E6E6E6" />
          <circle cx="518" cy="323" r="9" className="fill-primary-50" />
          <path
            d="M514 320h8v6h-8zM515 320v-1.5a3 3 0 016 0V320"
            className="stroke-primary-500"
            strokeWidth="1.6"
            fill="none"
          />
          <rect x="534" y="316" width="40" height="5" rx="2.5" fill="#4F4D55" fillOpacity="0.7" />
          <rect x="534" y="326" width="62" height="5" rx="2.5" className="fill-primary-300" />
        </g>
      </svg>

      {/* The product's own mark on the laptop screen's sidebar, over the
          drawing the way the Figma sets the logo on its fascia. */}
      <UbBox className="absolute left-[29.6%] top-[18%] w-[5.2%]">
        <UbLogo variant="mark" size="fill" className="block w-full" />
      </UbBox>
    </UbBox>
  );
}
