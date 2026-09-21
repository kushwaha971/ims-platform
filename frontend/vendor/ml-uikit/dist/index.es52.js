import { j as r } from "./index.es62.js";
import * as m from "react";
import * as e from "@radix-ui/react-slider";
import { cn as i } from "./index.es63.js";
const u = m.forwardRef(({ className: a, disabled: l, value: o, defaultValue: s, ...n }, d) => {
  const t = Array.isArray(o) ? o : Array.isArray(s) ? s : [0], f = t.length > 1;
  return /* @__PURE__ */ r.jsxs(
    e.Root,
    {
      ref: d,
      "data-disabled": l ? "true" : void 0,
      disabled: l,
      className: i(
        "group/slider relative flex w-full touch-none select-none items-center",
        a
      ),
      value: o,
      defaultValue: s,
      ...n,
      children: [
        /* @__PURE__ */ r.jsx(
          e.Track,
          {
            className: i(
              "relative h-2 w-full grow overflow-hidden rounded-full bg-[#e6e6e6] group-data-[disabled=true]/slider:bg-[#f2f2f2]"
            ),
            children: /* @__PURE__ */ r.jsx(
              e.Range,
              {
                className: i(
                  "absolute z-0 h-full bg-[#26453f]",
                  f ? "rounded-full" : "rounded-l-full"
                )
              }
            )
          }
        ),
        t.map((b, c) => /* @__PURE__ */ r.jsx(
          e.Thumb,
          {
            className: "block h-4 w-4 rounded-full border border-[#26453f] bg-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          },
          `thumb-${c}`
        ))
      ]
    }
  );
});
u.displayName = e.Root.displayName;
export {
  u as Slider
};
//# sourceMappingURL=index.es52.js.map
