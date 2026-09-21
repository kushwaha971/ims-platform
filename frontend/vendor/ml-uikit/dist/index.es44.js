import { j as o } from "./index.es62.js";
import * as t from "react";
import * as r from "@radix-ui/react-progress";
import { cn as i } from "./index.es63.js";
const m = t.forwardRef(({ className: a, value: s, ...e }, l) => /* @__PURE__ */ o.jsx(
  r.Root,
  {
    ref: l,
    className: i(
      "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
      a
    ),
    ...e,
    children: /* @__PURE__ */ o.jsx(
      r.Indicator,
      {
        className: "h-full w-full flex-1 bg-primary transition-all",
        style: { transform: `translateX(-${100 - (s || 0)}%)` }
      }
    )
  }
));
m.displayName = r.Root.displayName;
export {
  m as Progress
};
//# sourceMappingURL=index.es44.js.map
