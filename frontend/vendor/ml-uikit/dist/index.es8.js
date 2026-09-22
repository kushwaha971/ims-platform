import { j as e } from "./index.es62.js";
import { X as f } from "lucide-react";
import { cva as h } from "class-variance-authority";
import { cn as N } from "./index.es63.js";
const v = h("inline-flex items-center gap-1 rounded-[12px] font-medium", {
  variants: {
    variant: {
      color: "bg-accent text-text-inverse",
      neutral: "bg-surface-hover text-text-primary",
      "outline-color": "border border-accent bg-surface-card text-accent",
      "outline-neutral": "border border-border-subtle bg-surface-card text-text-primary",
      success: "bg-success-dim text-success",
      warning: "bg-warning-dim text-warning",
      destructive: "bg-formError-dim text-formError"
    },
    size: {
      default: "px-2 py-0.5 text-[12px] leading-[16px]",
      large: "px-2 py-1 text-[14px] leading-[20px]"
    }
  },
  defaultVariants: {
    variant: "color",
    size: "default"
  }
});
function V({
  className: m,
  variant: t,
  size: n,
  leftIcon: l,
  rightIcon: s,
  showX: u = !1,
  onXClick: i,
  xIcon: r,
  bgColor: c,
  textColor: o,
  borderColor: a,
  style: x,
  children: p,
  ...b
}) {
  const g = t === "default" ? "color" : t === "secondary" ? "neutral" : t === "outline" ? "outline-neutral" : t, d = n === "large" ? "h-4 w-4" : "h-3 w-3", j = c || o || a ? {
    backgroundColor: c,
    color: o,
    borderColor: a,
    ...x
  } : x;
  return /* @__PURE__ */ e.jsxs(
    "div",
    {
      className: N(
        v({ variant: g, size: n }),
        a ? "border" : void 0,
        m
      ),
      style: j,
      ...b,
      children: [
        l ? /* @__PURE__ */ e.jsx("span", { className: "inline-flex items-center", children: l }) : null,
        /* @__PURE__ */ e.jsx("span", { children: p }),
        s ? /* @__PURE__ */ e.jsx("span", { className: "inline-flex items-center", children: s }) : null,
        u ? i ? /* @__PURE__ */ e.jsx(
          "button",
          {
            type: "button",
            "aria-label": "Remove",
            onClick: i,
            className: "inline-flex items-center",
            children: r || /* @__PURE__ */ e.jsx(f, { className: d })
          }
        ) : /* @__PURE__ */ e.jsx("span", { className: "inline-flex items-center", children: r || /* @__PURE__ */ e.jsx(f, { className: d }) }) : null
      ]
    }
  );
}
export {
  V as Badge,
  v as badgeVariants
};
//# sourceMappingURL=index.es8.js.map
