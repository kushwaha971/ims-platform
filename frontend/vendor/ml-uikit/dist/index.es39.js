import { j as n } from "./index.es62.js";
import * as p from "react";
import { cn as a } from "./index.es63.js";
const b = {
  title: "text-[48px] leading-[64px]",
  h1: "text-[40px] leading-[56px]",
  h2: "text-[32px] leading-[48px]",
  h3: "text-[24px] leading-[40px]",
  h4: "text-[20px] leading-[32px]",
  "2xl": "text-[24px] leading-[40px]",
  xl: "text-[20px] leading-[32px]",
  l: "text-[16px] leading-[24px]",
  base: "text-[14px] leading-[20px]",
  s: "text-[12px] leading-[16px]",
  xs: "text-[10px] leading-[16px]"
}, r = {
  bold: "font-bold",
  semibold: "font-semibold",
  medium: "font-medium",
  regular: "font-normal",
  light: "font-light"
}, u = {
  title: { size: "title", weight: "bold", element: "h1" },
  h1: { size: "h1", weight: "semibold", element: "h1" },
  h2: { size: "h2", weight: "semibold", element: "h2" },
  h3: { size: "h3", weight: "semibold", element: "h3" },
  h4: { size: "h4", weight: "semibold", element: "h4" },
  "body-2xl-semibold": { size: "2xl", weight: "semibold", element: "p" },
  "body-2xl-medium": { size: "2xl", weight: "medium", element: "p" },
  "body-2xl-regular": { size: "2xl", weight: "regular", element: "p" },
  "body-xl-semibold": { size: "xl", weight: "semibold", element: "p" },
  "body-xl-medium": { size: "xl", weight: "medium", element: "p" },
  "body-xl-regular": { size: "xl", weight: "regular", element: "p" },
  "body-l-semibold": { size: "l", weight: "semibold", element: "p" },
  "body-l-medium": { size: "l", weight: "medium", element: "p" },
  "body-l-regular": { size: "l", weight: "regular", element: "p" },
  "body-l-light": { size: "l", weight: "light", element: "p" },
  "body-base-semibold": { size: "base", weight: "semibold", element: "p" },
  "body-base-medium": { size: "base", weight: "medium", element: "p" },
  "body-base-regular": { size: "base", weight: "regular", element: "p" },
  "body-base-light": { size: "base", weight: "light", element: "p" },
  "body-s-semibold": { size: "s", weight: "semibold", element: "p" },
  "body-s-medium": { size: "s", weight: "medium", element: "p" },
  "body-s-regular": { size: "s", weight: "regular", element: "p" },
  "body-s-light": { size: "s", weight: "light", element: "p" },
  "body-xs-semibold": { size: "xs", weight: "semibold", element: "p" },
  "body-xs-medium": { size: "xs", weight: "medium", element: "p" },
  "body-xs-regular": { size: "xs", weight: "regular", element: "p" },
  "body-xs-light": { size: "xs", weight: "light", element: "p" }
}, w = {
  title: "bold",
  h1: "semibold",
  h2: "semibold",
  h3: "semibold",
  h4: "semibold",
  "2xl": "regular",
  xl: "regular",
  l: "regular",
  base: "regular",
  s: "regular",
  xs: "regular"
}, z = {
  title: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  "2xl": "p",
  xl: "p",
  l: "p",
  base: "p",
  s: "p",
  xs: "p"
}, y = p.forwardRef(
  ({ size: i, weight: s, variant: t, as: m, className: o, ...d }, g) => {
    const e = t ? u[t] : null, l = i ?? e?.size ?? "base", h = s ?? e?.weight ?? w[l], x = m ?? e?.element ?? z[l];
    return /* @__PURE__ */ n.jsx(
      x,
      {
        ref: g,
        className: a(
          "text-foreground font-sans",
          b[l],
          r[h],
          o
        ),
        ...d
      }
    );
  }
);
y.displayName = "Typography";
export {
  y as Typography,
  u as typographyVariants
};
//# sourceMappingURL=index.es39.js.map
