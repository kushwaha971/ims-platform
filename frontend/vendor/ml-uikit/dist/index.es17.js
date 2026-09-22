import { j as e } from "./index.es62.js";
import * as s from "react";
import * as t from "@radix-ui/react-checkbox";
import { Check as o, Minus as b } from "lucide-react";
import { cn as d } from "./index.es63.js";
const c = s.forwardRef(({ className: a, ...r }, i) => /* @__PURE__ */ e.jsx(
  t.Root,
  {
    ref: i,
    className: d(
      "grid place-content-center peer h-4 w-4 shrink-0 rounded-[4px] border border-border-subtle bg-surface-card text-text-inverse transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:border-border-subtle disabled:text-text-muted",
      "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
      "data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
      "disabled:data-[state=checked]:border-border-strong disabled:data-[state=checked]:bg-border-strong",
      "disabled:data-[state=indeterminate]:border-border-strong disabled:data-[state=indeterminate]:bg-border-strong",
      a
    ),
    ...r,
    children: /* @__PURE__ */ e.jsxs(
      t.Indicator,
      {
        className: d("group grid place-content-center text-current"),
        children: [
          /* @__PURE__ */ e.jsx(o, { className: "hidden h-3.5 w-3.5 group-data-[state=checked]:block" }),
          /* @__PURE__ */ e.jsx(b, { className: "hidden h-3.5 w-3.5 group-data-[state=indeterminate]:block" })
        ]
      }
    )
  }
));
c.displayName = t.Root.displayName;
export {
  c as Checkbox
};
//# sourceMappingURL=index.es17.js.map
