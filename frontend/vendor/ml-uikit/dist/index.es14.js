import { j as d } from "./index.es62.js";
import * as s from "react";
import { cn as o } from "./index.es63.js";
const t = s.forwardRef(({ className: a, ...e }, r) => /* @__PURE__ */ d.jsx(
  "div",
  {
    ref: r,
    className: o(
      "rounded-xl border bg-card text-card-foreground shadow",
      a
    ),
    ...e
  }
));
t.displayName = "Card";
const i = s.forwardRef(({ className: a, ...e }, r) => /* @__PURE__ */ d.jsx(
  "div",
  {
    ref: r,
    className: o("flex flex-col space-y-1.5 p-6", a),
    ...e
  }
));
i.displayName = "CardHeader";
const m = s.forwardRef(({ className: a, ...e }, r) => /* @__PURE__ */ d.jsx(
  "div",
  {
    ref: r,
    className: o("font-semibold leading-none tracking-tight", a),
    ...e
  }
));
m.displayName = "CardTitle";
const n = s.forwardRef(({ className: a, ...e }, r) => /* @__PURE__ */ d.jsx(
  "div",
  {
    ref: r,
    className: o("text-sm text-muted-foreground", a),
    ...e
  }
));
n.displayName = "CardDescription";
const c = s.forwardRef(({ className: a, ...e }, r) => /* @__PURE__ */ d.jsx("div", { ref: r, className: o("p-6 pt-0", a), ...e }));
c.displayName = "CardContent";
const f = s.forwardRef(({ className: a, ...e }, r) => /* @__PURE__ */ d.jsx(
  "div",
  {
    ref: r,
    className: o("flex items-center p-6 pt-0", a),
    ...e
  }
));
f.displayName = "CardFooter";
export {
  t as Card,
  c as CardContent,
  n as CardDescription,
  f as CardFooter,
  i as CardHeader,
  m as CardTitle
};
//# sourceMappingURL=index.es14.js.map
