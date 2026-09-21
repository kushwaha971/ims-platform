import { j as e } from "./index.es62.js";
import * as o from "react";
import { Globe as R, ChevronDown as U, Check as G } from "lucide-react";
import * as L from "./index.es64.js";
import { cn as r } from "./index.es63.js";
import { Command as M, CommandInput as Y, CommandList as $, CommandEmpty as B, CommandGroup as D, CommandItem as H } from "./index.es19.js";
import { Popover as V, PopoverTrigger as q, PopoverContent as z } from "./index.es43.js";
import { PHONE_COUNTRY_OPTIONS as J } from "./index.es35.js";
const K = J, Q = L, W = (s) => {
  const c = Array.from(s);
  if (c.length !== 2)
    return null;
  const n = c.map((a) => {
    const l = a.codePointAt(0);
    return !l || l < 127462 || l > 127487 ? null : String.fromCharCode(l - 127462 + 65);
  });
  return n.some((a) => a === null) ? null : n.join("");
}, N = ({
  flag: s,
  className: c
}) => {
  const n = o.useMemo(
    () => W(s),
    [s]
  ), a = n ? Q[n] : void 0;
  return a ? /* @__PURE__ */ e.jsx(
    a,
    {
      "aria-hidden": "true",
      className: r("h-3.5 w-5 shrink-0 rounded-[2px] object-cover", c)
    }
  ) : /* @__PURE__ */ e.jsx("span", { "aria-hidden": "true", className: c, children: s });
}, X = o.forwardRef(
  ({
    className: s,
    inputClassName: c,
    label: n = "Phone number",
    helperText: a,
    error: l,
    country: i,
    defaultCountry: k,
    countryOptions: x = K,
    onCountryChange: f,
    disabled: d,
    type: C = "tel",
    onFocus: v,
    onBlur: y,
    placeholder: S = "Enter phone number",
    ...m
  }, P) => {
    const [h, b] = o.useState(!1), [I, g] = o.useState(!1), [O, F] = o.useState(
      k
    ), u = i ?? O, p = o.useMemo(
      () => x.find((t) => t.value === u),
      [x, u]
    ), E = o.useCallback(
      (t) => {
        i === void 0 && F(t.value), f?.(t), b(!1);
      },
      [i, f]
    ), T = m["aria-invalid"] === !0 || m["aria-invalid"] === "true", A = !!l || T, w = h || I;
    return /* @__PURE__ */ e.jsxs("div", { className: r("flex w-full flex-col items-start gap-1", s), children: [
      n ? /* @__PURE__ */ e.jsx("p", { className: "w-full text-[14px] font-medium leading-[20px] text-black", children: n }) : null,
      /* @__PURE__ */ e.jsxs(
        "div",
        {
          className: r(
            "flex h-10 w-full items-stretch overflow-hidden rounded-[8px] border bg-white transition-colors",
            d ? "border-[#e6e6e6] bg-[#f2f2f2]" : A ? "border-[#ff3b30]" : w ? "border-[#1d1c20]" : "border-[#e6e6e6]"
          ),
          children: [
            /* @__PURE__ */ e.jsxs(
              V,
              {
                open: h,
                onOpenChange: (t) => {
                  d || b(t);
                },
                children: [
                  /* @__PURE__ */ e.jsx(q, { asChild: !0, children: /* @__PURE__ */ e.jsxs(
                    "button",
                    {
                      type: "button",
                      disabled: d,
                      "aria-label": "Select country",
                      className: r(
                        "flex h-full shrink-0 items-center gap-1 px-2 text-[14px] leading-[20px] outline-none transition-colors",
                        p ? w ? "bg-white" : "bg-[#fafafa]" : "bg-white",
                        d && "bg-[#f2f2f2] text-[#b3b3b3]"
                      ),
                      children: [
                        p ? /* @__PURE__ */ e.jsxs(e.Fragment, { children: [
                          /* @__PURE__ */ e.jsx(N, { flag: p.flag }),
                          /* @__PURE__ */ e.jsx("span", { className: "font-normal text-black", children: p.label })
                        ] }) : /* @__PURE__ */ e.jsx(R, { className: "h-4 w-4 text-[#adacb0]" }),
                        /* @__PURE__ */ e.jsx(U, { className: "h-4 w-4 text-[#adacb0]" })
                      ]
                    }
                  ) }),
                  /* @__PURE__ */ e.jsx(
                    z,
                    {
                      align: "start",
                      sideOffset: 8,
                      className: "w-[240px] rounded-[8px] border border-[#e6e6e6] bg-white p-0 shadow-[0px_2px_4px_0px_rgba(19,25,39,0.12),0px_4px_4px_0px_rgba(19,25,39,0.08)]",
                      children: /* @__PURE__ */ e.jsxs(
                        M,
                        {
                          className: r(
                            "rounded-[8px] bg-white",
                            "[&_[cmdk-input-wrapper]]:mx-2 [&_[cmdk-input-wrapper]]:mb-1 [&_[cmdk-input-wrapper]]:mt-2 [&_[cmdk-input-wrapper]]:h-8 [&_[cmdk-input-wrapper]]:rounded-[4px] [&_[cmdk-input-wrapper]]:border [&_[cmdk-input-wrapper]]:border-[#e6e6e6] [&_[cmdk-input-wrapper]]:px-3",
                            "[&_[cmdk-input-wrapper]_svg]:mr-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input-wrapper]_svg]:text-[#adacb0]",
                            "[&_[cmdk-input]]:h-full [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-[14px] [&_[cmdk-input]]:leading-[20px] [&_[cmdk-input]]:text-black [&_[cmdk-input]]:placeholder:text-[#adacb0]"
                          ),
                          children: [
                            /* @__PURE__ */ e.jsx(Y, { placeholder: "Search country" }),
                            /* @__PURE__ */ e.jsxs($, { className: "max-h-56 px-1 pb-1", children: [
                              /* @__PURE__ */ e.jsx(B, { className: "px-3 py-2 text-left text-[12px] leading-[16px] text-[#7f7d83]", children: "No country found" }),
                              /* @__PURE__ */ e.jsx(D, { className: "p-0", children: x.map((t) => {
                                const _ = t.value === u, j = t.name || t.label;
                                return /* @__PURE__ */ e.jsxs(
                                  H,
                                  {
                                    value: `${t.label} ${j} ${t.dialCode}`,
                                    onSelect: () => E(t),
                                    className: r(
                                      "flex w-full cursor-pointer items-center gap-2 rounded-[4px] px-3 py-2 text-[14px] leading-[20px] text-black",
                                      "data-[selected=true]:bg-[#fafafa] data-[selected=true]:text-black",
                                      _ && "bg-[#fafafa]"
                                    ),
                                    children: [
                                      /* @__PURE__ */ e.jsx(N, { flag: t.flag }),
                                      /* @__PURE__ */ e.jsx("span", { className: "min-w-0 flex-1 truncate", children: j }),
                                      t.dialCode ? /* @__PURE__ */ e.jsx("span", { className: "text-[#7f7d83]", children: t.dialCode }) : null,
                                      /* @__PURE__ */ e.jsx(
                                        G,
                                        {
                                          className: r(
                                            "h-4 w-4 text-[#1d1c20]",
                                            _ ? "opacity-100" : "opacity-0"
                                          )
                                        }
                                      )
                                    ]
                                  },
                                  t.value
                                );
                              }) })
                            ] })
                          ]
                        }
                      )
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ e.jsxs(
              "div",
              {
                className: r(
                  "flex min-w-0 flex-1 items-center gap-2 border-l border-[#e6e6e6] bg-white px-3 py-2",
                  d && "bg-[#f2f2f2]"
                ),
                children: [
                  p?.dialCode ? /* @__PURE__ */ e.jsx("span", { className: "shrink-0 text-[14px] leading-[20px] text-[#7f7d83]", children: p.dialCode }) : null,
                  /* @__PURE__ */ e.jsx(
                    "input",
                    {
                      ref: P,
                      disabled: d,
                      placeholder: S,
                      onFocus: (t) => {
                        g(!0), v?.(t);
                      },
                      onBlur: (t) => {
                        g(!1), y?.(t);
                      },
                      className: r(
                        "h-full w-full min-w-0 border-0 bg-transparent p-0 text-[14px] leading-[20px] text-black outline-none placeholder:text-[#adacb0]",
                        d && "cursor-not-allowed text-[#9ca3af] placeholder:text-[#b3b3b3]",
                        c
                      ),
                      type: C,
                      ...m
                    }
                  )
                ]
              }
            )
          ]
        }
      ),
      l ? /* @__PURE__ */ e.jsx("p", { className: "w-full text-[12px] leading-[16px] text-[#ff3b30]", children: l }) : a ? /* @__PURE__ */ e.jsx("p", { className: "w-full text-[12px] leading-[16px] text-[#7f7d83]", children: a }) : null
    ] });
  }
);
X.displayName = "PhoneInput";
export {
  K as DEFAULT_COUNTRY_OPTIONS,
  X as PhoneInput
};
//# sourceMappingURL=index.es34.js.map
