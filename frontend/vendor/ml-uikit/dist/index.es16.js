import { j as r } from "./index.es62.js";
import * as f from "react";
import * as C from "recharts";
import { cn as i } from "./index.es63.js";
const R = { light: "", dark: ".dark" }, k = f.createContext(null);
function y() {
  const a = f.useContext(k);
  if (!a)
    throw new Error("useChart must be used within a <ChartContainer />");
  return a;
}
const T = f.forwardRef(({ id: a, className: e, children: o, config: t, ...c }, d) => {
  const l = f.useId(), s = `chart-${a || l.replace(/:/g, "")}`;
  return /* @__PURE__ */ r.jsx(k.Provider, { value: { config: t }, children: /* @__PURE__ */ r.jsxs(
    "div",
    {
      "data-chart": s,
      ref: d,
      className: i(
        "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
        e
      ),
      ...c,
      children: [
        /* @__PURE__ */ r.jsx(P, { id: s, config: t }),
        /* @__PURE__ */ r.jsx(C.ResponsiveContainer, { children: o })
      ]
    }
  ) });
});
T.displayName = "Chart";
const P = ({ id: a, config: e }) => {
  const o = Object.entries(e).filter(
    ([, t]) => t.theme || t.color
  );
  return o.length ? /* @__PURE__ */ r.jsx(
    "style",
    {
      dangerouslySetInnerHTML: {
        __html: Object.entries(R).map(
          ([t, c]) => `
${c} [data-chart=${a}] {
${o.map(([d, l]) => {
            const s = l.theme?.[t] || l.color;
            return s ? `  --color-${d}: ${s};` : null;
          }).join(`
`)}
}
`
        ).join(`
`)
      }
    }
  ) : null;
}, M = C.Tooltip, E = f.forwardRef(
  ({
    active: a,
    payload: e,
    className: o,
    indicator: t = "dot",
    hideLabel: c = !1,
    hideIndicator: d = !1,
    label: l,
    labelFormatter: s,
    labelClassName: g,
    formatter: h,
    color: N,
    nameKey: $,
    labelKey: p
  }, L) => {
    const { config: x } = y(), _ = f.useMemo(() => {
      if (c || !e?.length)
        return null;
      const [n] = e, v = `${p || n?.dataKey || n?.name || "value"}`, j = b(x, n, v), u = !p && typeof l == "string" ? x[l]?.label || l : j?.label;
      return s ? /* @__PURE__ */ r.jsx("div", { className: i("font-medium", g), children: s(u, e) }) : u ? /* @__PURE__ */ r.jsx("div", { className: i("font-medium", g), children: u }) : null;
    }, [
      l,
      s,
      e,
      c,
      g,
      x,
      p
    ]);
    if (!a || !e?.length)
      return null;
    const m = e.length === 1 && t !== "dot";
    return /* @__PURE__ */ r.jsxs(
      "div",
      {
        ref: L,
        className: i(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          o
        ),
        children: [
          m ? null : _,
          /* @__PURE__ */ r.jsx("div", { className: "grid gap-1.5", children: e.filter((n) => n.type !== "none").map((n, v) => {
            const j = `${$ || n.name || n.dataKey || "value"}`, u = b(x, n, j), w = N || n.payload.fill || n.color;
            return /* @__PURE__ */ r.jsx(
              "div",
              {
                className: i(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  t === "dot" && "items-center"
                ),
                children: h && n?.value !== void 0 && n.name ? h(n.value, n.name, n, v, n.payload) : /* @__PURE__ */ r.jsxs(r.Fragment, { children: [
                  u?.icon ? /* @__PURE__ */ r.jsx(u.icon, {}) : !d && /* @__PURE__ */ r.jsx(
                    "div",
                    {
                      className: i(
                        "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                        {
                          "h-2.5 w-2.5": t === "dot",
                          "w-1": t === "line",
                          "w-0 border-[1.5px] border-dashed bg-transparent": t === "dashed",
                          "my-0.5": m && t === "dashed"
                        }
                      ),
                      style: {
                        "--color-bg": w,
                        "--color-border": w
                      }
                    }
                  ),
                  /* @__PURE__ */ r.jsxs(
                    "div",
                    {
                      className: i(
                        "flex flex-1 justify-between leading-none",
                        m ? "items-end" : "items-center"
                      ),
                      children: [
                        /* @__PURE__ */ r.jsxs("div", { className: "grid gap-1.5", children: [
                          m ? _ : null,
                          /* @__PURE__ */ r.jsx("span", { className: "text-muted-foreground", children: u?.label || n.name })
                        ] }),
                        n.value && /* @__PURE__ */ r.jsx("span", { className: "font-mono font-medium tabular-nums text-foreground", children: n.value.toLocaleString() })
                      ]
                    }
                  )
                ] })
              },
              n.dataKey
            );
          }) })
        ]
      }
    );
  }
);
E.displayName = "ChartTooltip";
const H = C.Legend, I = f.forwardRef(
  ({ className: a, hideIcon: e = !1, payload: o, verticalAlign: t = "bottom", nameKey: c }, d) => {
    const { config: l } = y();
    return o?.length ? /* @__PURE__ */ r.jsx(
      "div",
      {
        ref: d,
        className: i(
          "flex items-center justify-center gap-4",
          t === "top" ? "pb-3" : "pt-3",
          a
        ),
        children: o.filter((s) => s.type !== "none").map((s) => {
          const g = `${c || s.dataKey || "value"}`, h = b(l, s, g);
          return /* @__PURE__ */ r.jsxs(
            "div",
            {
              className: i(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              ),
              children: [
                h?.icon && !e ? /* @__PURE__ */ r.jsx(h.icon, {}) : /* @__PURE__ */ r.jsx(
                  "div",
                  {
                    className: "h-2 w-2 shrink-0 rounded-[2px]",
                    style: {
                      backgroundColor: s.color
                    }
                  }
                ),
                h?.label
              ]
            },
            s.value
          );
        })
      }
    ) : null;
  }
);
I.displayName = "ChartLegend";
function b(a, e, o) {
  if (typeof e != "object" || e === null)
    return;
  const t = "payload" in e && typeof e.payload == "object" && e.payload !== null ? e.payload : void 0;
  let c = o;
  return o in e && typeof e[o] == "string" ? c = e[o] : t && o in t && typeof t[o] == "string" && (c = t[o]), c in a ? a[c] : a[o];
}
export {
  T as ChartContainer,
  H as ChartLegend,
  I as ChartLegendContent,
  P as ChartStyle,
  M as ChartTooltip,
  E as ChartTooltipContent
};
//# sourceMappingURL=index.es16.js.map
