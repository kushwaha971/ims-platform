import { j as e } from "./index.es62.js";
import * as n from "react";
import { Info as v, AlertCircle as w, CircleX as x, CheckCircle2 as h, SquareDashed as j } from "lucide-react";
import { cva as o } from "class-variance-authority";
import { cn as s } from "./index.es63.js";
const N = o(
  "flex w-full flex-col items-end gap-3 rounded-[8px] border bg-white px-3 py-3 text-[14px] leading-[20px] shadow-[0px_2px_4px_-2px_rgba(19,25,39,0.12),0px_4px_4px_-2px_rgba(19,25,39,0.08)]",
  {
    variants: {
      variant: {
        default: "border-[#e6e6e6] text-black",
        success: "border-[#307f4a] text-[#307f4a]",
        error: "border-[#e73f3f] text-[#e73f3f]",
        destructive: "border-[#e73f3f] text-[#e73f3f]",
        warning: "border-[#e49614] text-[#e49614]",
        info: "border-[#2563eb] text-[#2563eb]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
), b = o("flex h-6 w-6 shrink-0 items-center justify-center", {
  variants: {
    variant: {
      default: "text-[#adacb0]",
      success: "text-[#307f4a]",
      error: "text-[#e73f3f]",
      destructive: "text-[#e73f3f]",
      warning: "text-[#e49614]",
      info: "text-[#2563eb]"
    }
  },
  defaultVariants: {
    variant: "default"
  }
}), g = {
  warning: "warning",
  neutral: "default",
  success: "success",
  negative: "error"
}, _ = n.forwardRef(({ className: a, variant: r, icon: t, showIcon: d = !0, state: i, action: c, children: m, ...u }, p) => {
  const l = i ? g[i] : r ?? "default", f = t === void 0 ? {
    default: /* @__PURE__ */ e.jsx(j, { className: "h-5 w-5" }),
    success: /* @__PURE__ */ e.jsx(h, { className: "h-5 w-5" }),
    error: /* @__PURE__ */ e.jsx(x, { className: "h-5 w-5" }),
    destructive: /* @__PURE__ */ e.jsx(x, { className: "h-5 w-5" }),
    warning: /* @__PURE__ */ e.jsx(w, { className: "h-5 w-5" }),
    info: /* @__PURE__ */ e.jsx(v, { className: "h-5 w-5" })
  }[l] : t;
  return /* @__PURE__ */ e.jsxs(
    "div",
    {
      ref: p,
      role: "alert",
      className: s(N({ variant: l }), a),
      ...u,
      children: [
        /* @__PURE__ */ e.jsxs("div", { className: "flex w-full items-start gap-2", children: [
          d && f ? /* @__PURE__ */ e.jsx("span", { className: s(b({ variant: l })), children: f }) : null,
          /* @__PURE__ */ e.jsx("div", { className: "min-w-0 flex-1", children: m })
        ] }),
        c ? /* @__PURE__ */ e.jsx("div", { className: "flex w-full justify-end", children: c }) : null
      ]
    }
  );
});
_.displayName = "Alert";
const A = n.forwardRef(({ className: a, ...r }, t) => /* @__PURE__ */ e.jsx(
  "h5",
  {
    ref: t,
    className: s("text-[14px] font-normal leading-[20px] text-current", a),
    ...r
  }
));
A.displayName = "AlertTitle";
const y = n.forwardRef(({ className: a, ...r }, t) => /* @__PURE__ */ e.jsx(
  "div",
  {
    ref: t,
    className: s(
      "text-[12px] leading-[16px] text-[#7f7d83] [&:not(:first-child)]:mt-2",
      a
    ),
    ...r
  }
));
y.displayName = "AlertDescription";
export {
  _ as Alert,
  y as AlertDescription,
  A as AlertTitle
};
//# sourceMappingURL=index.es4.js.map
