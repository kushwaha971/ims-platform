import { j as a } from "./index.es62.js";
import * as d from "react";
import * as e from "@radix-ui/react-context-menu";
import { Check as l, Circle as c, ChevronRight as m } from "lucide-react";
import { cn as r } from "./index.es63.js";
const M = e.Root, R = e.Trigger, v = e.Group, I = e.Portal, S = e.Sub, z = e.RadioGroup, u = d.forwardRef(({ className: t, inset: o, children: n, ...s }, i) => /* @__PURE__ */ a.jsxs(
  e.SubTrigger,
  {
    ref: i,
    className: r(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
      o && "pl-8",
      t
    ),
    ...s,
    children: [
      n,
      /* @__PURE__ */ a.jsx(m, { className: "ml-auto h-4 w-4" })
    ]
  }
));
u.displayName = e.SubTrigger.displayName;
const p = d.forwardRef(({ className: t, ...o }, n) => /* @__PURE__ */ a.jsx(
  e.SubContent,
  {
    ref: n,
    className: r(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-context-menu-content-transform-origin]",
      t
    ),
    ...o
  }
));
p.displayName = e.SubContent.displayName;
const f = d.forwardRef(({ className: t, ...o }, n) => /* @__PURE__ */ a.jsx(e.Portal, { children: /* @__PURE__ */ a.jsx(
  e.Content,
  {
    ref: n,
    className: r(
      "z-50 max-h-[--radix-context-menu-content-available-height] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-context-menu-content-transform-origin]",
      t
    ),
    ...o
  }
) }));
f.displayName = e.Content.displayName;
const x = d.forwardRef(({ className: t, inset: o, ...n }, s) => /* @__PURE__ */ a.jsx(
  e.Item,
  {
    ref: s,
    className: r(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      o && "pl-8",
      t
    ),
    ...n
  }
));
x.displayName = e.Item.displayName;
const b = d.forwardRef(({ className: t, children: o, checked: n, ...s }, i) => /* @__PURE__ */ a.jsxs(
  e.CheckboxItem,
  {
    ref: i,
    className: r(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      t
    ),
    checked: n,
    ...s,
    children: [
      /* @__PURE__ */ a.jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ a.jsx(e.ItemIndicator, { children: /* @__PURE__ */ a.jsx(l, { className: "h-4 w-4" }) }) }),
      o
    ]
  }
));
b.displayName = e.CheckboxItem.displayName;
const g = d.forwardRef(({ className: t, children: o, ...n }, s) => /* @__PURE__ */ a.jsxs(
  e.RadioItem,
  {
    ref: s,
    className: r(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      t
    ),
    ...n,
    children: [
      /* @__PURE__ */ a.jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ a.jsx(e.ItemIndicator, { children: /* @__PURE__ */ a.jsx(c, { className: "h-4 w-4 fill-current" }) }) }),
      o
    ]
  }
));
g.displayName = e.RadioItem.displayName;
const h = d.forwardRef(({ className: t, inset: o, ...n }, s) => /* @__PURE__ */ a.jsx(
  e.Label,
  {
    ref: s,
    className: r(
      "px-2 py-1.5 text-sm font-semibold text-foreground",
      o && "pl-8",
      t
    ),
    ...n
  }
));
h.displayName = e.Label.displayName;
const N = d.forwardRef(({ className: t, ...o }, n) => /* @__PURE__ */ a.jsx(
  e.Separator,
  {
    ref: n,
    className: r("-mx-1 my-1 h-px bg-border", t),
    ...o
  }
));
N.displayName = e.Separator.displayName;
const y = ({
  className: t,
  ...o
}) => /* @__PURE__ */ a.jsx(
  "span",
  {
    className: r(
      "ml-auto text-xs tracking-widest text-muted-foreground",
      t
    ),
    ...o
  }
);
y.displayName = "ContextMenuShortcut";
export {
  M as ContextMenu,
  b as ContextMenuCheckboxItem,
  f as ContextMenuContent,
  v as ContextMenuGroup,
  x as ContextMenuItem,
  h as ContextMenuLabel,
  I as ContextMenuPortal,
  z as ContextMenuRadioGroup,
  g as ContextMenuRadioItem,
  N as ContextMenuSeparator,
  y as ContextMenuShortcut,
  S as ContextMenuSub,
  p as ContextMenuSubContent,
  u as ContextMenuSubTrigger,
  R as ContextMenuTrigger
};
//# sourceMappingURL=index.es20.js.map
