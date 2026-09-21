import { j as s } from "./index.es62.js";
import * as e from "react";
import * as o from "@radix-ui/react-separator";
import { cn as i } from "./index.es63.js";
const l = e.forwardRef(
  ({ className: a, orientation: r = "horizontal", decorative: t = !0, ...m }, p) => /* @__PURE__ */ s.jsx(
    o.Root,
    {
      ref: p,
      decorative: t,
      orientation: r,
      className: i(
        "shrink-0 bg-border",
        r === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        a
      ),
      ...m
    }
  )
);
l.displayName = o.Root.displayName;
export {
  l as Separator
};
//# sourceMappingURL=index.es48.js.map
