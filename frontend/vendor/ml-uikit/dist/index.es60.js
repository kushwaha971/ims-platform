import { j as n } from "./index.es62.js";
import * as e from "react";
import * as t from "@radix-ui/react-toggle-group";
import { cn as p } from "./index.es63.js";
import { toggleVariants as f } from "./index.es59.js";
const c = e.createContext({
  size: "default",
  variant: "default"
}), g = e.forwardRef(({ className: o, variant: r, size: a, children: s, ...i }, m) => /* @__PURE__ */ n.jsx(
  t.Root,
  {
    ref: m,
    className: p("flex items-center justify-center gap-1", o),
    ...i,
    children: /* @__PURE__ */ n.jsx(c.Provider, { value: { variant: r, size: a }, children: s })
  }
));
g.displayName = t.Root.displayName;
const u = e.forwardRef(({ className: o, children: r, variant: a, size: s, ...i }, m) => {
  const l = e.useContext(c);
  return /* @__PURE__ */ n.jsx(
    t.Item,
    {
      ref: m,
      className: p(
        f({
          variant: l.variant || a,
          size: l.size || s
        }),
        o
      ),
      ...i,
      children: r
    }
  );
});
u.displayName = t.Item.displayName;
export {
  g as ToggleGroup,
  u as ToggleGroupItem
};
//# sourceMappingURL=index.es60.js.map
