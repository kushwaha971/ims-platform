import { j as a } from "./index.es62.js";
import * as o from "react";
import * as i from "@radix-ui/react-dropdown-menu";
import { Search as E, X as v, Check as A } from "lucide-react";
import { cn as p } from "./index.es63.js";
const T = 280, N = "SearchableDropdownItem", g = "SearchableDropdownGroup", h = o.createContext(null), F = i.Root, H = i.Trigger, W = i.Portal;
function m(e) {
  return typeof e == "string" || typeof e == "number" ? String(e) : Array.isArray(e) ? e.map((t) => m(t)).join(" ") : o.isValidElement(e) ? m(
    e.props.children
  ) : "";
}
function P(e) {
  return typeof e == "string" ? e : e.displayName || e.name;
}
function D(e, t) {
  return t.trim() ? e.toLowerCase().includes(t.trim().toLowerCase()) : !0;
}
function x(e, t) {
  let r = !1;
  return o.Children.forEach(e, (n) => {
    if (r || !o.isValidElement(n))
      return;
    const l = P(n.type), s = n.props;
    if (l === N) {
      const d = s.searchableText ?? m(s.children);
      D(d, t) && (r = !0);
      return;
    }
    if (l === g) {
      x(s.children, t) && (r = !0);
      return;
    }
    x(s.children, t) && (r = !0);
  }), r;
}
const V = o.forwardRef(
  ({
    className: e,
    sideOffset: t = 8,
    searchPlaceholder: r = "Search...",
    searchValue: n,
    onSearchChange: l,
    contentWidth: s = T,
    children: d,
    style: b,
    ...w
  }, S) => {
    const u = o.useRef(null), [C, j] = o.useState(""), f = n ?? C, y = l ?? j, R = x(d, f);
    return o.useEffect(() => {
      const c = window.requestAnimationFrame(() => {
        u.current?.focus();
      });
      return () => {
        window.cancelAnimationFrame(c);
      };
    }, []), /* @__PURE__ */ a.jsx(i.Portal, { children: /* @__PURE__ */ a.jsxs(
      i.Content,
      {
        ref: S,
        sideOffset: t,
        className: p(
          "z-50 overflow-hidden rounded-lg border border-[#e5e5e5] bg-white shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
          e
        ),
        style: { width: s, ...b },
        ...w,
        children: [
          /* @__PURE__ */ a.jsx("div", { className: "border-b border-[#e5e5e5] px-4 py-3", children: /* @__PURE__ */ a.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 transition-colors focus-within:border-[#1D1C20]", children: [
            /* @__PURE__ */ a.jsx(E, { className: "size-5 flex-shrink-0 text-[#999999]" }),
            /* @__PURE__ */ a.jsx(
              "input",
              {
                ref: u,
                type: "text",
                placeholder: r,
                value: f,
                onChange: (c) => y(c.target.value),
                onKeyDown: (c) => {
                  c.key !== "Escape" && c.key !== "Tab" && c.stopPropagation();
                },
                className: "flex-1 bg-transparent text-[14px] text-[#111111] outline-none placeholder:text-[#999999]",
                autoComplete: "off",
                "aria-label": r
              }
            ),
            f ? /* @__PURE__ */ a.jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  y(""), u.current?.focus();
                },
                className: "flex-shrink-0 text-[#999999] transition-colors hover:text-[#111111]",
                "aria-label": "Clear search",
                children: /* @__PURE__ */ a.jsx(v, { className: "size-4" })
              }
            ) : null
          ] }) }),
          /* @__PURE__ */ a.jsx(
            h.Provider,
            {
              value: {
                searchValue: f,
                hasResults: R
              },
              children: /* @__PURE__ */ a.jsx("div", { className: "max-h-[400px] overflow-y-auto", children: d })
            }
          )
        ]
      }
    ) });
  }
);
V.displayName = "SearchableDropdownContent";
const _ = o.forwardRef(({ children: e, ...t }, r) => {
  const n = o.useContext(h);
  return n && !x(e, n.searchValue) ? null : /* @__PURE__ */ a.jsx(i.Group, { ref: r, ...t, children: e });
});
_.displayName = g;
const I = o.forwardRef(
  ({
    className: e,
    searchValue: t,
    searchableText: r,
    isSelected: n = !1,
    children: l,
    ...s
  }, d) => {
    const b = o.useContext(h), w = r ?? m(l), S = t ?? b?.searchValue ?? "";
    return D(w, S) ? /* @__PURE__ */ a.jsxs(
      i.Item,
      {
        ref: d,
        className: p(
          "relative flex cursor-pointer select-none items-center justify-between px-4 py-3 text-[15px] text-[#111111] outline-none transition-colors hover:bg-[#f5f5f5] focus:bg-[#f5f5f5] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          e
        ),
        ...s,
        children: [
          /* @__PURE__ */ a.jsx("span", { children: l }),
          n ? /* @__PURE__ */ a.jsx(A, { className: "size-5 text-[#26453f]" }) : null
        ]
      }
    ) : null;
  }
);
I.displayName = N;
const L = o.forwardRef(({ className: e, ...t }, r) => o.useContext(h)?.hasResults ? null : /* @__PURE__ */ a.jsx(
  "div",
  {
    ref: r,
    className: p("px-4 py-6 text-center text-sm text-[#666666]", e),
    ...t
  }
));
L.displayName = "SearchableDropdownEmpty";
const k = o.forwardRef(({ className: e, ...t }, r) => /* @__PURE__ */ a.jsx(
  "div",
  {
    ref: r,
    className: p("px-4 py-2 text-sm font-semibold text-[#666666]", e),
    ...t
  }
));
k.displayName = "SearchableDropdownLabel";
const z = o.forwardRef(({ className: e, ...t }, r) => /* @__PURE__ */ a.jsx(
  i.Separator,
  {
    ref: r,
    className: p("mx-0 my-0 h-px bg-[#e5e5e5]", e),
    ...t
  }
));
z.displayName = "SearchableDropdownSeparator";
export {
  F as SearchableDropdown,
  V as SearchableDropdownContent,
  L as SearchableDropdownEmpty,
  _ as SearchableDropdownGroup,
  I as SearchableDropdownItem,
  k as SearchableDropdownLabel,
  W as SearchableDropdownPortal,
  z as SearchableDropdownSeparator,
  H as SearchableDropdownTrigger
};
//# sourceMappingURL=index.es24.js.map
