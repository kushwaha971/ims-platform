import { j as s } from "./index.es62.js";
import * as r from "react";
import { ChevronDown as f, ChevronLeft as x, ChevronRight as c } from "lucide-react";
import { cn as o } from "./index.es63.js";
const m = r.forwardRef(
  ({ className: t, pagination: a, maxHeight: e, scrollContainerClassName: l, stickyHeader: n, ...d }, i) => /* @__PURE__ */ s.jsxs("div", { className: "relative w-full overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white", children: [
    /* @__PURE__ */ s.jsx(
      "div",
      {
        className: o("ml-table-scroll w-full overflow-auto", l),
        style: e ? { maxHeight: typeof e == "number" ? `${e}px` : e } : void 0,
        children: /* @__PURE__ */ s.jsx(
          "table",
          {
            ref: i,
            className: o(
              "w-full caption-bottom text-[14px] leading-[20px]",
              n ? "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-[#fafafa]" : void 0,
              t
            ),
            ...d
          }
        )
      }
    ),
    a ? /* @__PURE__ */ s.jsx("div", { className: "w-full", children: a }) : null
  ] })
);
m.displayName = "Table";
const p = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "thead",
  {
    ref: e,
    className: o("bg-[#fafafa] [&_tr]:border-b [&_tr]:border-[#e6e6e6]", t),
    ...a
  }
));
p.displayName = "TableHeader";
const b = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "tbody",
  {
    ref: e,
    className: o("[&_tr:last-child]:border-0", t),
    ...a
  }
));
b.displayName = "TableBody";
const g = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "tfoot",
  {
    ref: e,
    className: o(
      "border-t border-[#e6e6e6] bg-[#fafafa] font-medium [&>tr]:last:border-b-0",
      t
    ),
    ...a
  }
));
g.displayName = "TableFooter";
const N = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "tr",
  {
    ref: e,
    className: o(
      "border-b border-[#e6e6e6]",
      t
    ),
    ...a
  }
));
N.displayName = "TableRow";
const u = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "th",
  {
    ref: e,
    className: o(
      "h-12 px-3 py-2 text-left align-middle text-[14px] font-medium leading-[20px] text-foreground",
      t
    ),
    ...a
  }
));
u.displayName = "TableHead";
const T = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "td",
  {
    ref: e,
    className: o(
      "h-12 px-3 py-2 align-middle text-[14px] font-normal leading-[20px] text-foreground",
      t
    ),
    ...a
  }
));
T.displayName = "TableCell";
const w = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "caption",
  {
    ref: e,
    className: o("mt-4 text-sm text-muted-foreground", t),
    ...a
  }
));
w.displayName = "TableCaption";
const j = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "div",
  {
    ref: e,
    className: o(
      "grid w-full grid-cols-[auto_1fr_auto] items-center border-t border-[#e6e6e6] bg-white p-4",
      t
    ),
    ...a
  }
));
j.displayName = "TablePagination";
const h = r.forwardRef(({ className: t, label: a = "Total entries:", count: e = "-", ...l }, n) => /* @__PURE__ */ s.jsxs(
  "div",
  {
    ref: n,
    className: o("col-start-1 flex items-center gap-1 justify-self-start", t),
    ...l,
    children: [
      /* @__PURE__ */ s.jsx("span", { className: "text-[14px] font-normal leading-[20px] text-[#4f4d55]", children: a }),
      /* @__PURE__ */ s.jsx("span", { className: "text-[14px] font-normal leading-[20px] text-[#1d1c20]", children: e })
    ]
  }
));
h.displayName = "TablePaginationEntries";
const y = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "div",
  {
    ref: e,
    className: o("col-start-2 flex items-center gap-3 justify-self-center", t),
    ...a
  }
));
y.displayName = "TablePaginationContent";
const P = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "div",
  {
    ref: e,
    className: o("flex items-center gap-2", t),
    ...a
  }
));
P.displayName = "TablePaginationPages";
const R = r.forwardRef(({ className: t, ...a }, e) => /* @__PURE__ */ s.jsx(
  "button",
  {
    ref: e,
    type: "button",
    className: o(
      "flex h-7 w-7 items-center justify-center rounded-[8px] text-[#7f7d83] hover:text-foreground",
      t
    ),
    ...a
  }
));
R.displayName = "TablePaginationButton";
const v = r.forwardRef(({ className: t, isActive: a, ...e }, l) => /* @__PURE__ */ s.jsx(
  "button",
  {
    ref: l,
    type: "button",
    "aria-current": a ? "page" : void 0,
    className: o(
      "flex h-8 w-8 items-center justify-center rounded-[8px] text-[12px] leading-[16px]",
      a ? "border border-[#e6e6e6] bg-white text-foreground" : "text-[#7f7d83]",
      t
    ),
    ...e
  }
));
v.displayName = "TablePaginationPage";
const C = r.forwardRef(({ className: t, label: a = "Total entries:", total: e = "-", ...l }, n) => /* @__PURE__ */ s.jsxs(
  "div",
  {
    ref: n,
    className: o("flex items-center gap-1 text-[14px] font-normal leading-[20px]", t),
    ...l,
    children: [
      /* @__PURE__ */ s.jsx("span", { className: "text-[#4f4d55]", children: a }),
      /* @__PURE__ */ s.jsx("span", { className: "text-[#1d1c20]", children: e })
    ]
  }
));
C.displayName = "TablePaginationTotalEntries";
const _ = r.forwardRef(
  ({
    className: t,
    label: a = "Go to page:",
    pageLabel: e = "-",
    placeholder: l = "-",
    icon: n,
    ...d
  }, i) => /* @__PURE__ */ s.jsxs(
    "div",
    {
      ref: i,
      className: o("col-start-3 flex items-center gap-[13px] justify-self-end", t),
      ...d,
      children: [
        /* @__PURE__ */ s.jsx("span", { className: "text-[14px] font-normal leading-[20px] text-foreground", children: a }),
        /* @__PURE__ */ s.jsxs(
          "button",
          {
            type: "button",
            "aria-haspopup": "listbox",
            className: "flex h-8 min-w-[72px] items-center justify-between gap-2 rounded-[8px] border border-[#e6e6e6] bg-white px-3 text-[12px] leading-[16px] text-foreground shadow-sm",
            children: [
              /* @__PURE__ */ s.jsx("span", { className: e === l ? "text-[#7f7d83]" : void 0, children: e === l ? l : e }),
              n || /* @__PURE__ */ s.jsx(f, { className: "h-4 w-4 text-[#7f7d83]" })
            ]
          }
        )
      ]
    }
  )
);
_.displayName = "TablePaginationGoTo";
const F = ({
  className: t,
  direction: a
}) => a === "left" ? /* @__PURE__ */ s.jsx(x, { className: o("h-4 w-4", t) }) : /* @__PURE__ */ s.jsx(c, { className: o("h-4 w-4", t) });
export {
  m as Table,
  b as TableBody,
  w as TableCaption,
  T as TableCell,
  g as TableFooter,
  u as TableHead,
  p as TableHeader,
  j as TablePagination,
  R as TablePaginationButton,
  y as TablePaginationContent,
  h as TablePaginationEntries,
  _ as TablePaginationGoTo,
  F as TablePaginationIcon,
  v as TablePaginationPage,
  P as TablePaginationPages,
  C as TablePaginationTotalEntries,
  N as TableRow
};
//# sourceMappingURL=index.es56.js.map
