import { j as t } from "./index.es62.js";
import * as r from "react";
import { Button as s } from "./index.es10.js";
import { cn as c } from "./index.es63.js";
const a = {
  mini: "icon-mini",
  sm: "icon-sm",
  md: "icon",
  lg: "icon-lg"
}, e = r.forwardRef(
  ({ className: o, size: i = "md", ...m }, n) => /* @__PURE__ */ t.jsx(
    s,
    {
      ref: n,
      size: a[i],
      className: c("shrink-0", o),
      ...m
    }
  )
);
e.displayName = "IconButton";
export {
  e as IconButton
};
//# sourceMappingURL=index.es11.js.map
