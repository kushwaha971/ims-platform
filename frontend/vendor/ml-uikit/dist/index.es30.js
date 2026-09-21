import { j as s } from "./index.es62.js";
import * as o from "react";
import { EyeOff as c, Eye as d } from "lucide-react";
import { cn as f } from "./index.es63.js";
import { Input as u } from "./index.es29.js";
const x = o.forwardRef(
  ({
    className: a,
    showLabel: r = "Show password",
    hideLabel: i = "Hide password",
    disabled: e,
    ...l
  }, n) => {
    const [t, p] = o.useState(!1);
    return /* @__PURE__ */ s.jsxs("div", { className: "relative w-full", children: [
      /* @__PURE__ */ s.jsx(
        u,
        {
          ref: n,
          type: t ? "text" : "password",
          disabled: e,
          className: f("pr-10", a),
          ...l
        }
      ),
      /* @__PURE__ */ s.jsx(
        "button",
        {
          type: "button",
          onClick: () => p((m) => !m),
          disabled: e,
          "aria-label": t ? i : r,
          className: "absolute right-3 top-1/2 -translate-y-1/2 text-[#7f7d83] transition-colors hover:text-[#111111] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-[#b3b3b3]",
          children: t ? /* @__PURE__ */ s.jsx(c, { className: "h-4 w-4" }) : /* @__PURE__ */ s.jsx(d, { className: "h-4 w-4" })
        }
      )
    ] });
  }
);
x.displayName = "PasswordInput";
export {
  x as PasswordInput
};
//# sourceMappingURL=index.es30.js.map
