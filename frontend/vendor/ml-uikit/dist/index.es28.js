import { j as i } from "./index.es62.js";
import * as n from "react";
import * as t from "@radix-ui/react-hover-card";
import { cn as s } from "./index.es63.js";
const l = t.Root, c = t.Trigger, m = n.forwardRef(({ className: o, align: e = "center", sideOffset: a = 4, ...r }, d) => /* @__PURE__ */ i.jsx(
  t.Content,
  {
    ref: d,
    align: e,
    sideOffset: a,
    className: s(
      "z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-hover-card-content-transform-origin]",
      o
    ),
    ...r
  }
));
m.displayName = t.Content.displayName;
export {
  l as HoverCard,
  m as HoverCardContent,
  c as HoverCardTrigger
};
//# sourceMappingURL=index.es28.js.map
