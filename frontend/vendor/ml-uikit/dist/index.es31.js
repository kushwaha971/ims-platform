import { j as t } from "./index.es62.js";
import * as l from "react";
import { startOfMonth as p, addMonths as z, isAfter as v, isBefore as J, setMonth as ce, setYear as fe, format as me } from "date-fns";
import { CalendarDays as ue, ChevronLeft as xe, ChevronDown as W, ChevronRight as be } from "lucide-react";
import { DayPicker as he } from "react-day-picker";
import { cn as x } from "./index.es63.js";
import { Button as q } from "./index.es10.js";
import { Popover as pe, PopoverTrigger as ge, PopoverContent as we } from "./index.es43.js";
const ve = "dd/MM/yyyy", De = "DD/MM/YYYY - DD/MM/YYYY", je = Array.from(
  { length: 12 },
  (e, n) => new Date(2020, n, 1).toLocaleString("default", { month: "long" })
), N = (e, n, i) => J(e, n) ? n : v(e, i) ? i : e, C = (e) => {
  if (!(!e?.from && !e?.to))
    return e.from && e.to && v(e.from, e.to) ? {
      from: e.to,
      to: e.from
    } : {
      from: e.from,
      to: e.to
    };
}, S = (e, n) => {
  if (e)
    return me(e, n);
}, ye = (e, n) => {
  const i = S(e?.from, n), m = S(e?.to, n);
  return !i || !m ? "" : `${i} - ${m}`;
}, Me = (e, n) => {
  const i = S(e?.from, n) ?? "DD/MM/YYYY", m = S(e?.to, n) ?? "DD/MM/YYYY";
  return `${i} - ${m}`;
};
function G({
  label: e,
  month: n,
  minMonth: i,
  maxMonth: m,
  minDate: Y,
  maxDate: k,
  selectedDate: E,
  disabledMatcher: D,
  disabled: g,
  years: j,
  onMonthChange: u,
  onSelectDate: y
}) {
  const w = () => {
    u(z(n, -1));
  }, P = () => {
    u(z(n, 1));
  }, A = g || !v(n, i), f = g || !J(n, m);
  return /* @__PURE__ */ t.jsxs("div", { className: "w-full min-w-0", children: [
    /* @__PURE__ */ t.jsxs("div", { className: "flex flex-wrap items-center gap-2 sm:flex-nowrap", children: [
      /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          onClick: w,
          disabled: A,
          className: x(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6e6d71] transition-colors lg:h-9 lg:w-9",
            "hover:bg-[#f5f5f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1c20]/20",
            "disabled:cursor-not-allowed disabled:opacity-40"
          ),
          "aria-label": `Previous month for ${e.toLowerCase()}`,
          children: /* @__PURE__ */ t.jsx(xe, { className: "h-4 w-4 lg:h-5 lg:w-5" })
        }
      ),
      /* @__PURE__ */ t.jsxs("div", { className: "relative min-w-0 flex-1", children: [
        /* @__PURE__ */ t.jsx(
          "select",
          {
            value: n.getMonth(),
            onChange: (s) => {
              const a = Number(s.target.value);
              u(ce(n, a));
            },
            disabled: g,
            className: x(
              "h-9 w-full appearance-none rounded-md border border-[#b7b7b9] bg-white px-3 pr-8 text-left text-sm font-medium leading-5 text-[#111111] lg:h-10 lg:px-4 lg:pr-10",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1c20]/20",
              "disabled:cursor-not-allowed disabled:bg-[#f2f2f2] disabled:text-[#b3b3b3]"
            ),
            "aria-label": `Month for ${e.toLowerCase()}`,
            children: je.map((s, a) => /* @__PURE__ */ t.jsx("option", { value: a, children: s }, s))
          }
        ),
        /* @__PURE__ */ t.jsx(W, { className: "pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f7d83] lg:right-3" })
      ] }),
      /* @__PURE__ */ t.jsxs("div", { className: "relative w-[104px] shrink-0 sm:w-[120px]", children: [
        /* @__PURE__ */ t.jsx(
          "select",
          {
            value: n.getFullYear(),
            onChange: (s) => {
              const a = Number(s.target.value);
              u(fe(n, a));
            },
            disabled: g,
            className: x(
              "h-9 w-full appearance-none rounded-md border border-[#b7b7b9] bg-white px-3 pr-8 text-left text-sm font-medium leading-5 text-[#111111] lg:h-10 lg:px-4 lg:pr-9",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1c20]/20",
              "disabled:cursor-not-allowed disabled:bg-[#f2f2f2] disabled:text-[#b3b3b3]"
            ),
            "aria-label": `Year for ${e.toLowerCase()}`,
            children: j.map((s) => /* @__PURE__ */ t.jsx("option", { value: s, children: s }, s))
          }
        ),
        /* @__PURE__ */ t.jsx(W, { className: "pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f7d83] lg:right-3" })
      ] }),
      /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          onClick: P,
          disabled: f,
          className: x(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6e6d71] transition-colors lg:h-9 lg:w-9",
            "hover:bg-[#f5f5f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1c20]/20",
            "disabled:cursor-not-allowed disabled:opacity-40"
          ),
          "aria-label": `Next month for ${e.toLowerCase()}`,
          children: /* @__PURE__ */ t.jsx(be, { className: "h-4 w-4 lg:h-5 lg:w-5" })
        }
      )
    ] }),
    /* @__PURE__ */ t.jsx("p", { className: "mt-1.5 text-center text-sm font-medium leading-5 text-[#666666] lg:mt-2", children: e }),
    /* @__PURE__ */ t.jsx(
      he,
      {
        mode: "single",
        month: n,
        onMonthChange: u,
        selected: E,
        onSelect: y,
        showOutsideDays: !0,
        fixedWeeks: !0,
        hideNavigation: !0,
        disabled: [
          { before: Y },
          { after: k },
          ...D ? [D] : []
        ],
        className: "mt-1 p-0 [--drp-cell-size:1.625rem] md:[--drp-cell-size:1.875rem] xl:[--drp-cell-size:2.125rem]",
        classNames: {
          root: "w-full",
          months: "w-full",
          month: "w-full",
          month_caption: "hidden",
          month_grid: "w-full border-collapse",
          weekdays: "grid grid-cols-7",
          weekday: "h-[calc(var(--drp-cell-size)-0.25rem)] text-center text-[11px] font-medium leading-4 text-[#666666] lg:text-xs",
          weeks: "grid gap-0",
          week: "grid grid-cols-7",
          day: "flex h-[var(--drp-cell-size)] w-full items-center justify-center p-0",
          day_button: "h-[--drp-cell-size] w-[--drp-cell-size] rounded-md border border-transparent bg-transparent p-0 text-[13px] font-normal leading-none text-[#444444] transition-colors hover:border-[#cccccc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2bbd8f]/25 lg:text-sm",
          selected: "[&>button]:border-[#2bbd8f] [&>button]:bg-[#2bbd8f] [&>button]:text-[#111111]",
          today: "font-medium",
          outside: "text-[#a4a4a8]",
          disabled: "pointer-events-none text-[#d3d3d6]",
          hidden: "invisible"
        }
      }
    )
  ] });
}
const Ne = l.forwardRef(
  ({
    value: e,
    defaultValue: n,
    onValueChange: i,
    wrapperClassName: m,
    popoverClassName: Y,
    popoverSide: k = "bottom",
    popoverAvoidCollisions: E = !0,
    className: D,
    placeholder: g = De,
    dateFormat: j = ve,
    minYear: u = 2e3,
    maxYear: y = 2100,
    disabled: w,
    ...P
  }, A) => {
    const f = Math.min(u, y), s = Math.max(u, y), a = l.useMemo(
      () => p(new Date(f, 0, 1)),
      [f]
    ), b = l.useMemo(
      () => p(new Date(s, 11, 1)),
      [s]
    ), R = l.useMemo(() => new Date(f, 0, 1), [f]), O = l.useMemo(
      () => new Date(s, 11, 31),
      [s]
    ), $ = l.useMemo(
      () => Array.from(
        { length: s - f + 1 },
        (o, c) => f + c
      ),
      [f, s]
    ), B = e !== void 0, [K, Q] = l.useState(
      C(n)
    ), h = C(B ? e : K), L = l.useCallback(
      (o) => {
        const c = p(/* @__PURE__ */ new Date()), r = N(
          p(o?.from ?? c),
          a,
          b
        ), ie = o?.to ? p(o.to) : z(r, 1), de = N(ie, a, b);
        return {
          start: r,
          end: de
        };
      },
      [a, b]
    ), [T, V] = l.useState(!1), [d, _] = l.useState(
      h
    ), H = L(h), [X, U] = l.useState(H.start), [Z, F] = l.useState(H.end), M = l.useCallback(
      (o) => {
        const c = C(o);
        _(c);
        const r = L(c);
        U(r.start), F(r.end);
      },
      [L]
    );
    l.useEffect(() => {
      T || M(h);
    }, [h, T, M]);
    const ee = (o) => {
      U(N(p(o), a, b));
    }, te = (o) => {
      F(N(p(o), a, b));
    }, oe = (o) => {
      o && _((c) => {
        const r = {
          from: o,
          to: c?.to
        };
        return r.to && v(o, r.to) && (r.to = o), r;
      });
    }, ne = (o) => {
      o && _((c) => {
        const r = {
          from: c?.from,
          to: o
        };
        return r.from && v(r.from, o) && (r.from = o), r;
      });
    }, se = () => {
      M(h), V(!1);
    }, re = () => {
      const o = C(d);
      B || Q(o), i?.(o), V(!1);
    }, le = !!(d?.from && d?.to), I = ye(h, j), ae = Me(d, j);
    return /* @__PURE__ */ t.jsx("div", { className: x("w-full", m), children: /* @__PURE__ */ t.jsxs(
      pe,
      {
        open: T,
        onOpenChange: (o) => {
          w || (o && M(h), V(o));
        },
        children: [
          /* @__PURE__ */ t.jsx(ge, { asChild: !0, children: /* @__PURE__ */ t.jsxs(
            "button",
            {
              ref: A,
              type: "button",
              disabled: w,
              className: x(
                "flex h-10 w-full items-center justify-between rounded-[8px] border border-[#e6e6e6] bg-white px-3 py-2 text-left text-[14px] leading-[20px] transition-colors",
                "focus-visible:outline-none focus-visible:border-[#1D1C20] focus-visible:ring-0",
                "disabled:cursor-not-allowed disabled:bg-[#f2f2f2] disabled:text-[#9ca3af] disabled:opacity-100",
                D
              ),
              ...P,
              children: [
                /* @__PURE__ */ t.jsx(
                  "span",
                  {
                    className: x(
                      "truncate text-[14px] font-normal leading-[20px]",
                      I ? "text-[#111111]" : "text-[#b3b3b3]"
                    ),
                    children: I || g
                  }
                ),
                /* @__PURE__ */ t.jsx(ue, { className: "ml-3 h-4 w-4 shrink-0 text-[#111111]" })
              ]
            }
          ) }),
          /* @__PURE__ */ t.jsxs(
            we,
            {
              side: k,
              avoidCollisions: E,
              align: "start",
              sideOffset: 10,
              className: x(
                "w-[min(95vw,760px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-xl border border-[#d8d8da] bg-[#f7f7f8] p-3 shadow-[0px_12px_24px_rgba(0,0,0,0.08)] sm:p-4",
                Y
              ),
              children: [
                /* @__PURE__ */ t.jsxs("div", { className: "grid gap-3 md:grid-cols-2 md:gap-4", children: [
                  /* @__PURE__ */ t.jsx(
                    G,
                    {
                      label: "Start date",
                      month: X,
                      minMonth: a,
                      maxMonth: b,
                      minDate: R,
                      maxDate: O,
                      selectedDate: d?.from,
                      disabledMatcher: d?.to ? { after: d.to } : void 0,
                      disabled: w,
                      years: $,
                      onMonthChange: ee,
                      onSelectDate: oe
                    }
                  ),
                  /* @__PURE__ */ t.jsx(
                    G,
                    {
                      label: "End date",
                      month: Z,
                      minMonth: a,
                      maxMonth: b,
                      minDate: R,
                      maxDate: O,
                      selectedDate: d?.to,
                      disabledMatcher: d?.from ? { before: d.from } : void 0,
                      disabled: w,
                      years: $,
                      onMonthChange: te,
                      onSelectDate: ne
                    }
                  )
                ] }),
                /* @__PURE__ */ t.jsxs("div", { className: "mt-2.5 border-t border-[#d8d8da] pt-2.5", children: [
                  /* @__PURE__ */ t.jsx(
                    "input",
                    {
                      readOnly: !0,
                      value: ae,
                      className: "h-9 w-full rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm leading-5 text-[#111111] outline-none transition-colors placeholder:text-[#b3b3b3] focus-visible:border-[#1D1C20]",
                      "aria-label": "Selected date range"
                    }
                  ),
                  /* @__PURE__ */ t.jsxs("div", { className: "mt-2.5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", children: [
                    /* @__PURE__ */ t.jsx(
                      q,
                      {
                        type: "button",
                        variant: "outline",
                        className: "h-9 rounded-md px-4 text-sm",
                        onClick: se,
                        children: "Cancel"
                      }
                    ),
                    /* @__PURE__ */ t.jsx(
                      q,
                      {
                        type: "button",
                        className: "h-9 rounded-md px-4 text-sm",
                        disabled: !le,
                        onClick: re,
                        children: "Apply"
                      }
                    )
                  ] })
                ] })
              ]
            }
          )
        ]
      }
    ) });
  }
);
Ne.displayName = "DateRangePicker";
export {
  Ne as DateRangePicker
};
//# sourceMappingURL=index.es31.js.map
