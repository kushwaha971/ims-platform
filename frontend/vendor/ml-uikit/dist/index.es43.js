import { j as t } from "./index.es62.js";
import * as d from "react";
import * as o from "@radix-ui/react-popover";
import { cn as s } from "./index.es63.js";
const c = o.Root, l = o.Trigger, g = o.Anchor, m = d.forwardRef(({ className: e, align: a = "center", sideOffset: r = 4, ...i }, n) => /* @__PURE__ */ t.jsx(o.Portal, { children: /* @__PURE__ */ t.jsx(
  o.Content,
  {
    ref: n,
    align: a,
    sideOffset: r,
    className: s(
      "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
      e
    ),
    ...i
  }
) }));
m.displayName = o.Content.displayName;
export {
  c as Popover,
  g as PopoverAnchor,
  m as PopoverContent,
  l as PopoverTrigger
};
//# sourceMappingURL=index.es43.js.map
