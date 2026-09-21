import { j as r } from "./index.es62.js";
import * as t from "react";
import * as e from "@radix-ui/react-radio-group";
import { cn as a } from "./index.es63.js";
const d = t.forwardRef(({ className: s, ...o }, i) => /* @__PURE__ */ r.jsx(
  e.Root,
  {
    className: a("grid gap-2", s),
    ...o,
    ref: i
  }
));
d.displayName = e.Root.displayName;
const l = t.forwardRef(({ className: s, ...o }, i) => /* @__PURE__ */ r.jsx(
  e.Item,
  {
    ref: i,
    className: a(
      "relative flex h-4 w-4 items-center justify-center rounded-full border border-[#e6e6e6] bg-white text-[#26453f] transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:bg-[#f2f2f2] disabled:border-[#e6e6e6] disabled:text-[#bdbdbd]",
      "data-[state=checked]:border-[#26453f]",
      s
    ),
    ...o,
    children: /* @__PURE__ */ r.jsx(e.Indicator, { className: "flex items-center justify-center", children: /* @__PURE__ */ r.jsx("span", { className: "h-2.5 w-2.5 rounded-full bg-current" }) })
  }
));
l.displayName = e.Item.displayName;
export {
  d as RadioGroup,
  l as RadioGroupItem
};
//# sourceMappingURL=index.es45.js.map
