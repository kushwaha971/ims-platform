import { j as e } from "./index.es62.js";
import * as n from "react";
import { Info as v, AlertCircle as w, CircleX as x, CheckCircle2 as h, SquareDashed as j } from "lucide-react";
import { cva as o } from "class-variance-authority";
import { cn as s } from "./index.es63.js";
const N = o(
  "flex w-full flex-col items-end gap-3 rounded-[8px] border bg-surface-card px-3 py-3 text-[14px] leading-[20px] shadow-[0px_2px_4px_-2px_rgba(19,25,39,0.12),0px_4px_4px_-2px_rgba(19,25,39,0.08)]",
  {
    variants: {
      variant: {
        default: "border-border-subtle text-text-primary",
        success: "border-success text-success",
        error: "border-formError text-formError",
        destructive: "border-formError text-formError",
        warning: "border-warning text-warning",
        info: "border-info text-info"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
), b = o("flex h-6 w-6 shrink-0 items-center justify-center", {
  variants: {
    variant: {
      default: "text-text-muted",
      success: "text-success",
      error: "text-formError",
      destructive: "text-formError",
      warning: "text-warning",
      info: "text-info"
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
      "text-[12px] leading-[16px] text-text-tertiary [&:not(:first-child)]:mt-2",
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
