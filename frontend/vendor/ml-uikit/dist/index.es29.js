import { j as t } from "./index.es62.js";
import * as l from "react";
import { cn as a } from "./index.es63.js";
const d = l.forwardRef(
  ({ className: e, type: i, ...r }, o) => /* @__PURE__ */ t.jsx(
    "input",
    {
      type: i,
      className: a(
        "flex h-10 w-full rounded-[8px] border border-border-subtle bg-surface-card px-3 py-2 text-[14px] leading-[20px] text-text-primary transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-text-muted focus-visible:outline-none focus-visible:border-text-primary focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted disabled:placeholder:text-text-muted disabled:opacity-100",
        "aria-invalid:border-formError aria-invalid:focus-visible:border-formError",
        e
      ),
      ref: o,
      ...r
    }
  )
);
d.displayName = "Input";
export {
  d as Input
};
//# sourceMappingURL=index.es29.js.map
