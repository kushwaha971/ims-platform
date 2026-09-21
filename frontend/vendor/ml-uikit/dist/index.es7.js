import { j as s } from "./index.es62.js";
import * as t from "react";
import * as a from "@radix-ui/react-avatar";
import { cn as m } from "./index.es63.js";
const o = t.forwardRef(({ className: e, ...l }, r) => /* @__PURE__ */ s.jsx(
  a.Root,
  {
    ref: r,
    className: m(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      e
    ),
    ...l
  }
));
o.displayName = a.Root.displayName;
const f = t.forwardRef(({ className: e, ...l }, r) => /* @__PURE__ */ s.jsx(
  a.Image,
  {
    ref: r,
    className: m("aspect-square h-full w-full", e),
    ...l
  }
));
f.displayName = a.Image.displayName;
const i = t.forwardRef(({ className: e, ...l }, r) => /* @__PURE__ */ s.jsx(
  a.Fallback,
  {
    ref: r,
    className: m(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      e
    ),
    ...l
  }
));
i.displayName = a.Fallback.displayName;
export {
  o as Avatar,
  i as AvatarFallback,
  f as AvatarImage
};
//# sourceMappingURL=index.es7.js.map
