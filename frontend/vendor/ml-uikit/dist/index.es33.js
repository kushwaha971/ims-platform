import { j as r } from "./index.es62.js";
import * as a from "react";
import { OTPInput as m, OTPInputContext as c } from "input-otp";
import { Minus as u } from "lucide-react";
import { cn as n } from "./index.es63.js";
const f = a.forwardRef(({ className: e, containerClassName: t, ...s }, o) => /* @__PURE__ */ r.jsx(
  m,
  {
    ref: o,
    containerClassName: n(
      "flex items-center gap-2 has-[:disabled]:opacity-50",
      t
    ),
    className: n("disabled:cursor-not-allowed", e),
    ...s
  }
));
f.displayName = "InputOTP";
const x = a.forwardRef(({ className: e, ...t }, s) => /* @__PURE__ */ r.jsx("div", { ref: s, className: n("flex items-center", e), ...t }));
x.displayName = "InputOTPGroup";
const j = a.forwardRef(({ index: e, className: t, ...s }, o) => {
  const i = a.useContext(c), { char: d, hasFakeCaret: l, isActive: p } = i.slots[e];
  return /* @__PURE__ */ r.jsxs(
    "div",
    {
      ref: o,
      className: n(
        "relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md",
        p && "z-10 ring-1 ring-ring",
        t
      ),
      ...s,
      children: [
        d,
        l && /* @__PURE__ */ r.jsx("div", { className: "pointer-events-none absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ r.jsx("div", { className: "h-4 w-px animate-caret-blink bg-foreground duration-1000" }) })
      ]
    }
  );
});
j.displayName = "InputOTPSlot";
const O = a.forwardRef(({ ...e }, t) => /* @__PURE__ */ r.jsx("div", { ref: t, role: "separator", ...e, children: /* @__PURE__ */ r.jsx(u, {}) }));
O.displayName = "InputOTPSeparator";
export {
  f as InputOTP,
  x as InputOTPGroup,
  O as InputOTPSeparator,
  j as InputOTPSlot
};
//# sourceMappingURL=index.es33.js.map
