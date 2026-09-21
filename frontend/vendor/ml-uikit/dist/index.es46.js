import { j as l } from "./index.es62.js";
import * as t from "react";
import * as r from "@radix-ui/react-scroll-area";
import { cn as c } from "./index.es63.js";
const d = t.forwardRef(({ className: o, children: e, ...a }, s) => /* @__PURE__ */ l.jsxs(
  r.Root,
  {
    ref: s,
    className: c("relative overflow-hidden", o),
    ...a,
    children: [
      /* @__PURE__ */ l.jsx(r.Viewport, { className: "h-full w-full rounded-[inherit]", children: e }),
      /* @__PURE__ */ l.jsx(i, {}),
      /* @__PURE__ */ l.jsx(r.Corner, {})
    ]
  }
));
d.displayName = r.Root.displayName;
const i = t.forwardRef(({ className: o, orientation: e = "vertical", ...a }, s) => /* @__PURE__ */ l.jsx(
  r.ScrollAreaScrollbar,
  {
    ref: s,
    orientation: e,
    className: c(
      "flex touch-none select-none transition-colors",
      e === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      e === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      o
    ),
    ...a,
    children: /* @__PURE__ */ l.jsx(r.ScrollAreaThumb, { className: "relative flex-1 rounded-full bg-border" })
  }
));
i.displayName = r.ScrollAreaScrollbar.displayName;
export {
  d as ScrollArea,
  i as ScrollBar
};
//# sourceMappingURL=index.es46.js.map
