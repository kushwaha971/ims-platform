import { j as n } from "./index.es62.js";
import * as g from "react";
import { ChevronLeftIcon as b, ChevronRightIcon as w, ChevronDownIcon as h } from "lucide-react";
import { getDefaultClassNames as f, DayPicker as _ } from "react-day-picker";
import { cn as e } from "./index.es63.js";
import { buttonVariants as m, Button as y } from "./index.es10.js";
function D({
  className: c,
  classNames: i,
  showOutsideDays: r = !0,
  captionLayout: s = "label",
  buttonVariant: l = "ghost",
  formatters: u,
  components: p,
  ...x
}) {
  const t = f();
  return /* @__PURE__ */ n.jsx(
    _,
    {
      showOutsideDays: r,
      className: e(
        "bg-background group/calendar p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        c
      ),
      captionLayout: s,
      formatters: {
        formatMonthDropdown: (a) => a.toLocaleString("default", { month: "short" }),
        ...u
      },
      classNames: {
        root: e("w-fit", t.root),
        months: e(
          "relative flex flex-col gap-4 md:flex-row",
          t.months
        ),
        month: e("flex w-full flex-col gap-4", t.month),
        nav: e(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          t.nav
        ),
        button_previous: e(
          m({ variant: l }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50",
          t.button_previous
        ),
        button_next: e(
          m({ variant: l }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50",
          t.button_next
        ),
        month_caption: e(
          "flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]",
          t.month_caption
        ),
        dropdowns: e(
          "flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium",
          t.dropdowns
        ),
        dropdown_root: e(
          "has-focus:border-ring border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] relative rounded-md border",
          t.dropdown_root
        ),
        dropdown: e(
          "bg-popover absolute inset-0 opacity-0",
          t.dropdown
        ),
        caption_label: e(
          "select-none font-medium",
          s === "label" ? "text-sm" : "[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
          t.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: e("flex", t.weekdays),
        weekday: e(
          "text-muted-foreground flex-1 select-none rounded-md text-[0.8rem] font-normal",
          t.weekday
        ),
        week: e("mt-2 flex w-full", t.week),
        week_number_header: e(
          "w-[--cell-size] select-none",
          t.week_number_header
        ),
        week_number: e(
          "text-muted-foreground select-none text-[0.8rem]",
          t.week_number
        ),
        day: e(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
          t.day
        ),
        range_start: e(
          "bg-accent rounded-l-md",
          t.range_start
        ),
        range_middle: e("rounded-none", t.range_middle),
        range_end: e("bg-accent rounded-r-md", t.range_end),
        today: e(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          t.today
        ),
        outside: e(
          "text-muted-foreground aria-selected:text-muted-foreground",
          t.outside
        ),
        disabled: e(
          "text-muted-foreground opacity-50",
          t.disabled
        ),
        hidden: e("invisible", t.hidden),
        ...i
      },
      components: {
        Root: ({ className: a, rootRef: d, ...o }) => /* @__PURE__ */ n.jsx(
          "div",
          {
            "data-slot": "calendar",
            ref: d,
            className: e(a),
            ...o
          }
        ),
        Chevron: ({ className: a, orientation: d, ...o }) => d === "left" ? /* @__PURE__ */ n.jsx(b, { className: e("size-4", a), ...o }) : d === "right" ? /* @__PURE__ */ n.jsx(
          w,
          {
            className: e("size-4", a),
            ...o
          }
        ) : /* @__PURE__ */ n.jsx(h, { className: e("size-4", a), ...o }),
        DayButton: v,
        WeekNumber: ({ children: a, ...d }) => /* @__PURE__ */ n.jsx("td", { ...d, children: /* @__PURE__ */ n.jsx("div", { className: "flex size-[--cell-size] items-center justify-center text-center", children: a }) }),
        ...p
      },
      ...x
    }
  );
}
function v({
  className: c,
  day: i,
  modifiers: r,
  ...s
}) {
  const l = f(), u = g.useRef(null);
  return g.useEffect(() => {
    r.focused && u.current?.focus();
  }, [r.focused]), /* @__PURE__ */ n.jsx(
    y,
    {
      ref: u,
      variant: "ghost",
      size: "icon",
      "data-day": i.date.toLocaleDateString(),
      "data-selected-single": r.selected && !r.range_start && !r.range_end && !r.range_middle,
      "data-range-start": r.range_start,
      "data-range-end": r.range_end,
      "data-range-middle": r.range_middle,
      className: e(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 flex aspect-square h-auto w-full min-w-[--cell-size] flex-col gap-1 font-normal leading-none data-[range-end=true]:rounded-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] [&>span]:text-xs [&>span]:opacity-70",
        l.day,
        c
      ),
      ...s
    }
  );
}
export {
  D as Calendar,
  v as CalendarDayButton
};
//# sourceMappingURL=index.es13.js.map
