import { j as t } from "./index.es62.js";
import * as d from "react";
import * as o from "@radix-ui/react-tooltip";
import { cn as s } from "./index.es63.js";
const p = o.Provider, f = o.Root, c = o.Trigger, n = d.forwardRef(({ className: i, sideOffset: e = 4, ...r }, a) => /* @__PURE__ */ t.jsx(o.Portal, { children: /* @__PURE__ */ t.jsx(
  o.Content,
  {
    ref: a,
    sideOffset: e,
    className: s(
      "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]",
      i
    ),
    ...r
  }
) }));
n.displayName = o.Content.displayName;
export {
  f as Tooltip,
  n as TooltipContent,
  p as TooltipProvider,
  c as TooltipTrigger
};
//# sourceMappingURL=index.es61.js.map
