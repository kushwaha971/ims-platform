/**
 * The hero illustration on the auth split panel.
 *
 * ── It is this product's own drawing, not BrandHub's ────────────────────────
 * BrandHub's `CustomerAuthStorefront` is a 648x435 shop front, and what is
 * borrowed from it is the TECHNIQUE, not the artwork: every structural path is
 * `fill="currentColor"` so the illustration takes the tenant's brand colour from
 * whatever `text-*` class the parent sets, with white overlays at low opacity
 * doing the shading. That is the thing worth copying — it is what makes one
 * drawing work for every white-label tenant without exporting a new asset.
 *
 * The subject is a shutter-front shop with a ledger on the counter, which is
 * what this product is: a khata for a merchant who opens a shutter every
 * morning. Drawn as flat geometry so it stays legible at 320px and costs
 * nothing to ship — no request, no raster, and it scales to a 2560px screen.
 *
 * `aria-hidden`: it carries no information the headline beside it does not.
 */
export function AuthHeroArt(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 400 300"
      aria-hidden
      focusable="false"
      className="block h-auto w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Ground line — a static neutral, never the brand colour, so the shop
          reads as standing on something rather than floating in it. */}
      <rect x="20" y="252" width="360" height="3" rx="1.5" className="fill-border-strong" />

      {/* Awning */}
      <path d="M60 78h280l22 34H38z" fill="currentColor" />
      <path d="M60 78h280l22 34H38z" fill="#fff" fillOpacity="0.18" />
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <path
          key={n}
          d={`M${76 + n * 42} 78l-14 34h22l14-34z`}
          fill="#fff"
          fillOpacity="0.28"
        />
      ))}

      {/* Shop body */}
      <rect x="52" y="112" width="296" height="140" fill="currentColor" />
      <rect x="52" y="112" width="296" height="140" fill="#fff" fillOpacity="0.72" />

      {/* Signboard — the darkest brand block, where a tenant's name would sit */}
      <rect x="96" y="126" width="208" height="34" rx="6" fill="currentColor" />

      {/* Half-open shutter, slats and all */}
      <rect x="88" y="176" width="104" height="76" rx="4" fill="currentColor" fillOpacity="0.16" />
      {[0, 1, 2, 3].map((n) => (
        <rect
          key={n}
          x="92"
          y={180 + n * 13}
          width="96"
          height="7"
          rx="3.5"
          fill="currentColor"
          fillOpacity="0.4"
        />
      ))}

      {/* Counter, and the ledger open on it */}
      <rect x="212" y="206" width="112" height="46" rx="4" fill="currentColor" fillOpacity="0.24" />
      <path d="M232 198h72v22h-72z" fill="#fff" />
      <path d="M232 198h36v22h-36z" fill="#fff" fillOpacity="0.85" />
      <path d="M268 196v24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {[0, 1, 2].map((n) => (
        <path
          key={n}
          d={`M238 ${204 + n * 5}h24`}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.55"
        />
      ))}
      {[0, 1, 2].map((n) => (
        <path
          key={n}
          d={`M274 ${204 + n * 5}h24`}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.35"
        />
      ))}

      {/* Two coins on the counter — the "you got" half of the ledger */}
      <circle cx="204" cy="238" r="9" fill="currentColor" fillOpacity="0.5" />
      <circle cx="204" cy="232" r="9" fill="currentColor" />
      <circle cx="204" cy="232" r="9" fill="#fff" fillOpacity="0.25" />
    </svg>
  );
}
