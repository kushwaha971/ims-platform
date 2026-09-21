import { j as i } from "./index.es62.js";
import * as s from "react";
import * as e from "@radix-ui/react-toggle";
import { cva as m } from "class-variance-authority";
import { cn as d } from "./index.es63.js";
const g = m(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground"
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
), l = s.forwardRef(({ className: t, variant: o, size: n, ...r }, a) => /* @__PURE__ */ i.jsx(
  e.Root,
  {
    ref: a,
    className: d(g({ variant: o, size: n, className: t })),
    ...r
  }
));
l.displayName = e.Root.displayName;
export {
  l as Toggle,
  g as toggleVariants
};
//# sourceMappingURL=index.es59.js.map
