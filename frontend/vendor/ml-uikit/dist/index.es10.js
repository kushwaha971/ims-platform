import { j as l } from "./index.es62.js";
import * as p from "react";
import { Slot as g } from "@radix-ui/react-slot";
import { cva as c } from "class-variance-authority";
import { cn as d } from "./index.es63.js";
const e = "bg-accent text-text-inverse hover:bg-accent-press", u = "bg-surface-hover text-text-primary hover:bg-border-subtle", v = "border border-accent bg-surface-card text-accent hover:bg-accent-quiet", t = "border border-border-subtle bg-surface-card text-text-primary hover:bg-surface-hover", x = "bg-transparent text-text-primary hover:bg-surface-hover", b = "bg-formError text-text-inverse hover:bg-formError", m = "text-accent underline-offset-4 hover:underline", h = c(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: e,
        primary: e,
        secondary: u,
        "outline-primary": v,
        "outline-neutral": t,
        outline: t,
        ghost: x,
        destructive: b,
        link: m
      },
      size: {
        default: "h-10 px-4 text-[14px] leading-[20px] [&_svg]:size-4",
        lg: "h-11 px-5 text-[14px] leading-[20px] [&_svg]:size-5",
        sm: "h-8 px-3 text-[12px] leading-[16px] [&_svg]:size-3.5",
        mini: "h-7 px-2 text-[12px] leading-[16px] [&_svg]:size-3",
        icon: "h-10 w-10 p-0 [&_svg]:size-4",
        "icon-lg": "h-11 w-11 p-0 [&_svg]:size-5",
        "icon-sm": "h-8 w-8 p-0 [&_svg]:size-3.5",
        "icon-mini": "h-7 w-7 p-0 [&_svg]:size-3"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
), w = p.forwardRef(
  ({ className: i, variant: n, size: r, asChild: o = !1, ...s }, a) => {
    const f = o ? g : "button";
    return /* @__PURE__ */ l.jsx(
      f,
      {
        className: d(h({ variant: n, size: r, className: i })),
        ref: a,
        ...s
      }
    );
  }
);
w.displayName = "Button";
export {
  w as Button,
  h as buttonVariants
};
//# sourceMappingURL=index.es10.js.map
