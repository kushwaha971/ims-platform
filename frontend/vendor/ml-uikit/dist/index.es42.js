import { j as s } from "./index.es62.js";
import * as o from "react";
import { ChevronLeft as r, ChevronRight as m, MoreHorizontal as c } from "lucide-react";
import { cn as e } from "./index.es63.js";
import { buttonVariants as p } from "./index.es10.js";
const g = ({ className: i, ...a }) => /* @__PURE__ */ s.jsx(
  "nav",
  {
    role: "navigation",
    "aria-label": "pagination",
    className: e("mx-auto flex w-full justify-center", i),
    ...a
  }
);
g.displayName = "Pagination";
const x = o.forwardRef(({ className: i, ...a }, n) => /* @__PURE__ */ s.jsx(
  "ul",
  {
    ref: n,
    className: e("flex flex-row items-center gap-1", i),
    ...a
  }
));
x.displayName = "PaginationContent";
const N = o.forwardRef(({ className: i, ...a }, n) => /* @__PURE__ */ s.jsx("li", { ref: n, className: e("", i), ...a }));
N.displayName = "PaginationItem";
const t = ({
  className: i,
  isActive: a,
  size: n = "icon",
  ...l
}) => /* @__PURE__ */ s.jsx(
  "a",
  {
    "aria-current": a ? "page" : void 0,
    className: e(
      p({
        variant: a ? "outline" : "ghost",
        size: n
      }),
      i
    ),
    ...l
  }
);
t.displayName = "PaginationLink";
const d = ({
  className: i,
  ...a
}) => /* @__PURE__ */ s.jsxs(
  t,
  {
    "aria-label": "Go to previous page",
    size: "default",
    className: e("gap-1 pl-2.5", i),
    ...a,
    children: [
      /* @__PURE__ */ s.jsx(r, { className: "h-4 w-4" }),
      /* @__PURE__ */ s.jsx("span", { children: "Previous" })
    ]
  }
);
d.displayName = "PaginationPrevious";
const f = ({
  className: i,
  ...a
}) => /* @__PURE__ */ s.jsxs(
  t,
  {
    "aria-label": "Go to next page",
    size: "default",
    className: e("gap-1 pr-2.5", i),
    ...a,
    children: [
      /* @__PURE__ */ s.jsx("span", { children: "Next" }),
      /* @__PURE__ */ s.jsx(m, { className: "h-4 w-4" })
    ]
  }
);
f.displayName = "PaginationNext";
const j = ({
  className: i,
  ...a
}) => /* @__PURE__ */ s.jsxs(
  "span",
  {
    "aria-hidden": !0,
    className: e("flex h-9 w-9 items-center justify-center", i),
    ...a,
    children: [
      /* @__PURE__ */ s.jsx(c, { className: "h-4 w-4" }),
      /* @__PURE__ */ s.jsx("span", { className: "sr-only", children: "More pages" })
    ]
  }
);
j.displayName = "PaginationEllipsis";
export {
  g as Pagination,
  x as PaginationContent,
  j as PaginationEllipsis,
  N as PaginationItem,
  t as PaginationLink,
  f as PaginationNext,
  d as PaginationPrevious
};
//# sourceMappingURL=index.es42.js.map
