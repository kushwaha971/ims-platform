import { j as a } from "./index.es62.js";
import * as o from "react";
import { Slot as n } from "@radix-ui/react-slot";
import { ChevronRight as c, MoreHorizontal as d } from "lucide-react";
import { cn as t } from "./index.es63.js";
const l = o.forwardRef(({ ...r }, e) => /* @__PURE__ */ a.jsx("nav", { ref: e, "aria-label": "breadcrumb", ...r }));
l.displayName = "Breadcrumb";
const p = o.forwardRef(({ className: r, ...e }, s) => /* @__PURE__ */ a.jsx(
  "ol",
  {
    ref: s,
    className: t(
      "flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5",
      r
    ),
    ...e
  }
));
p.displayName = "BreadcrumbList";
const u = o.forwardRef(({ className: r, ...e }, s) => /* @__PURE__ */ a.jsx(
  "li",
  {
    ref: s,
    className: t("inline-flex items-center gap-1.5", r),
    ...e
  }
));
u.displayName = "BreadcrumbItem";
const f = o.forwardRef(({ asChild: r, className: e, ...s }, m) => {
  const i = r ? n : "a";
  return /* @__PURE__ */ a.jsx(
    i,
    {
      ref: m,
      className: t("transition-colors hover:text-foreground", e),
      ...s
    }
  );
});
f.displayName = "BreadcrumbLink";
const x = o.forwardRef(({ className: r, ...e }, s) => /* @__PURE__ */ a.jsx(
  "span",
  {
    ref: s,
    role: "link",
    "aria-disabled": "true",
    "aria-current": "page",
    className: t("font-normal text-foreground", r),
    ...e
  }
));
x.displayName = "BreadcrumbPage";
const b = ({
  children: r,
  className: e,
  ...s
}) => /* @__PURE__ */ a.jsx(
  "li",
  {
    role: "presentation",
    "aria-hidden": "true",
    className: t("[&>svg]:w-3.5 [&>svg]:h-3.5", e),
    ...s,
    children: r ?? /* @__PURE__ */ a.jsx(c, {})
  }
);
b.displayName = "BreadcrumbSeparator";
const N = ({
  className: r,
  ...e
}) => /* @__PURE__ */ a.jsxs(
  "span",
  {
    role: "presentation",
    "aria-hidden": "true",
    className: t("flex h-9 w-9 items-center justify-center", r),
    ...e,
    children: [
      /* @__PURE__ */ a.jsx(d, { className: "h-4 w-4" }),
      /* @__PURE__ */ a.jsx("span", { className: "sr-only", children: "More" })
    ]
  }
);
N.displayName = "BreadcrumbElipssis";
export {
  l as Breadcrumb,
  N as BreadcrumbEllipsis,
  u as BreadcrumbItem,
  f as BreadcrumbLink,
  p as BreadcrumbList,
  x as BreadcrumbPage,
  b as BreadcrumbSeparator
};
//# sourceMappingURL=index.es9.js.map
