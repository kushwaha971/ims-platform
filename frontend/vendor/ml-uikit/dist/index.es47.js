import { j as e } from "./index.es62.js";
import * as l from "react";
import * as t from "@radix-ui/react-select";
import { ChevronDown as b, Search as I, Check as P, ChevronUp as V } from "lucide-react";
import { cn as i } from "./index.es63.js";
const A = t.Root, K = t.Group, G = t.Value, k = l.forwardRef(({ className: a, children: s, ...o }, n) => /* @__PURE__ */ e.jsxs(
  t.Trigger,
  {
    ref: n,
    className: i(
      "flex h-10 w-full items-center justify-between whitespace-nowrap rounded-[8px] border border-border-subtle bg-surface-card px-3 py-2 text-[14px] leading-[20px] text-text-primary shadow-none",
      "data-[placeholder]:text-text-muted [&>span]:line-clamp-1",
      "focus-visible:outline-none focus-visible:border-text-primary data-[state=open]:border-text-primary",
      "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted disabled:data-[placeholder]:text-text-muted",
      "aria-invalid:border-formError aria-invalid:focus-visible:border-formError",
      a
    ),
    ...o,
    children: [
      s,
      /* @__PURE__ */ e.jsx(t.Icon, { asChild: !0, children: /* @__PURE__ */ e.jsx(b, { className: "h-4 w-4 text-text-tertiary" }) })
    ]
  }
));
k.displayName = t.Trigger.displayName;
const w = l.forwardRef(({ className: a, ...s }, o) => /* @__PURE__ */ e.jsx(
  t.ScrollUpButton,
  {
    ref: o,
    className: i(
      "flex cursor-default items-center justify-center py-1 text-text-tertiary",
      a
    ),
    ...s,
    children: /* @__PURE__ */ e.jsx(V, { className: "h-4 w-4" })
  }
));
w.displayName = t.ScrollUpButton.displayName;
const y = l.forwardRef(({ className: a, ...s }, o) => /* @__PURE__ */ e.jsx(
  t.ScrollDownButton,
  {
    ref: o,
    className: i(
      "flex cursor-default items-center justify-center py-1 text-text-tertiary",
      a
    ),
    ...s,
    children: /* @__PURE__ */ e.jsx(b, { className: "h-4 w-4" })
  }
));
y.displayName = t.ScrollDownButton.displayName;
const g = l.createContext({
  enabled: !1,
  query: ""
}), m = (a) => typeof a == "string" || typeof a == "number" ? String(a) : Array.isArray(a) ? a.map(m).join(" ") : l.isValidElement(a) ? m(a.props.children) : "", B = l.forwardRef(
  ({
    className: a,
    children: s,
    position: o = "popper",
    enableSearch: n = !1,
    searchPlaceholder: c = "Search...",
    searchValue: d,
    onSearchValueChange: p,
    ...f
  }, N) => {
    const [j, S] = l.useState(""), C = l.useRef(null), v = l.useCallback(
      (r) => {
        C.current = r, !(!r || !n) && window.requestAnimationFrame(() => {
          r.focus();
        });
      },
      [n]
    ), x = d ?? j, u = x.trim().toLowerCase(), R = l.useMemo(
      () => ({
        enabled: n,
        query: u
      }),
      [n, u]
    ), D = (r) => {
      const h = r.target.value;
      d === void 0 && S(h), p?.(h);
    };
    return /* @__PURE__ */ e.jsx(t.Portal, { children: /* @__PURE__ */ e.jsxs(
      t.Content,
      {
        ref: N,
        className: i(
          "relative z-50 max-h-[--radix-select-content-available-height] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-[8px] border border-border-subtle bg-surface-card text-text-primary shadow-sm",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin]",
          o === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          a
        ),
        position: o,
        ...f,
        children: [
          /* @__PURE__ */ e.jsx(w, {}),
          n ? /* @__PURE__ */ e.jsx("div", { className: "border-b border-border-subtle p-1", children: /* @__PURE__ */ e.jsxs("div", { className: "flex h-9 items-center gap-2 rounded-[6px] border border-border-subtle px-2", children: [
            /* @__PURE__ */ e.jsx(I, { className: "h-4 w-4 text-text-tertiary" }),
            /* @__PURE__ */ e.jsx(
              "input",
              {
                ref: v,
                type: "text",
                value: x,
                onChange: D,
                onClick: (r) => {
                  r.stopPropagation();
                },
                onPointerDown: (r) => {
                  r.stopPropagation();
                },
                onKeyDownCapture: (r) => {
                  r.key !== "Escape" && r.stopPropagation();
                },
                onKeyUpCapture: (r) => {
                  r.stopPropagation();
                },
                onKeyDown: (r) => {
                  r.key !== "Escape" && r.stopPropagation();
                },
                placeholder: c,
                "aria-label": "Search options",
                className: "h-full w-full border-0 bg-transparent text-[14px] leading-[20px] text-text-primary outline-none placeholder:text-text-muted"
              }
            )
          ] }) }) : null,
          /* @__PURE__ */ e.jsx(
            t.Viewport,
            {
              className: i(
                "p-1",
                o === "popper" && "w-full min-w-[var(--radix-select-trigger-width)]"
              ),
              children: /* @__PURE__ */ e.jsx(g.Provider, { value: R, children: s })
            }
          ),
          /* @__PURE__ */ e.jsx(y, {})
        ]
      }
    ) });
  }
);
B.displayName = t.Content.displayName;
const L = l.forwardRef(({ className: a, ...s }, o) => /* @__PURE__ */ e.jsx(
  t.Label,
  {
    ref: o,
    className: i("px-2 py-1 text-[12px] font-medium text-text-tertiary", a),
    ...s
  }
));
L.displayName = t.Label.displayName;
const T = l.forwardRef(({ className: a, children: s, ...o }, n) => {
  const { enabled: c, query: d } = l.useContext(g), p = m(s).toLowerCase(), f = c && d.length > 0 && !p.includes(d);
  return /* @__PURE__ */ e.jsxs(
    t.Item,
    {
      ref: n,
      className: i(
        "relative flex w-full cursor-default select-none items-center rounded-[6px] py-2 pl-2 pr-8 text-[14px] leading-[20px] outline-none",
        "focus:bg-surface-hover focus:text-text-primary data-[state=checked]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        f && "hidden",
        a
      ),
      ...o,
      children: [
        /* @__PURE__ */ e.jsx("span", { className: "absolute right-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ e.jsx(t.ItemIndicator, { children: /* @__PURE__ */ e.jsx(P, { className: "h-4 w-4 text-accent" }) }) }),
        /* @__PURE__ */ e.jsx(t.ItemText, { children: s })
      ]
    }
  );
});
T.displayName = t.Item.displayName;
const U = l.forwardRef(({ className: a, ...s }, o) => /* @__PURE__ */ e.jsx(
  t.Separator,
  {
    ref: o,
    className: i("-mx-1 my-1 h-px bg-border-subtle", a),
    ...s
  }
));
U.displayName = t.Separator.displayName;
export {
  A as Select,
  B as SelectContent,
  K as SelectGroup,
  T as SelectItem,
  L as SelectLabel,
  y as SelectScrollDownButton,
  w as SelectScrollUpButton,
  U as SelectSeparator,
  k as SelectTrigger,
  G as SelectValue
};
//# sourceMappingURL=index.es47.js.map
