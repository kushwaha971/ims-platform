import { j as t } from "./index.es62.js";
import * as a from "react";
import * as e from "@radix-ui/react-switch";
import { cn as s } from "./index.es63.js";
const n = a.forwardRef(({ className: i, ...o }, r) => /* @__PURE__ */ t.jsx(
  e.Root,
  {
    className: s(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-subtle transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white",
      "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-100",
      "data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-subtle",
      i
    ),
    ...o,
    ref: r,
    children: /* @__PURE__ */ t.jsx(
      e.Thumb,
      {
        className: s(
          "pointer-events-none block h-4 w-4 rounded-full bg-surface-card shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )
      }
    )
  }
));
n.displayName = e.Root.displayName;
export {
  n as Switch
};
//# sourceMappingURL=index.es55.js.map
