import { j as a } from "./index.es62.js";
import * as d from "react";
import * as e from "@radix-ui/react-dropdown-menu";
import { Check as l, Circle as m, ChevronRight as c } from "lucide-react";
import { cn as r } from "./index.es63.js";
const D = e.Root, M = e.Trigger, R = e.Group, I = e.Portal, S = e.Sub, C = e.RadioGroup, p = d.forwardRef(({ className: o, inset: t, children: n, ...s }, i) => /* @__PURE__ */ a.jsxs(
  e.SubTrigger,
  {
    ref: i,
    className: r(
      "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      t && "pl-8",
      o
    ),
    ...s,
    children: [
      n,
      /* @__PURE__ */ a.jsx(c, { className: "ml-auto" })
    ]
  }
));
p.displayName = e.SubTrigger.displayName;
const u = d.forwardRef(({ className: o, ...t }, n) => /* @__PURE__ */ a.jsx(
  e.SubContent,
  {
    ref: n,
    className: r(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
      o
    ),
    ...t
  }
));
u.displayName = e.SubContent.displayName;
const f = d.forwardRef(({ className: o, sideOffset: t = 4, ...n }, s) => /* @__PURE__ */ a.jsx(e.Portal, { children: /* @__PURE__ */ a.jsx(
  e.Content,
  {
    ref: s,
    sideOffset: t,
    className: r(
      "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
      o
    ),
    ...n
  }
) }));
f.displayName = e.Content.displayName;
const x = d.forwardRef(({ className: o, inset: t, ...n }, s) => /* @__PURE__ */ a.jsx(
  e.Item,
  {
    ref: s,
    className: r(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
      t && "pl-8",
      o
    ),
    ...n
  }
));
x.displayName = e.Item.displayName;
const g = d.forwardRef(({ className: o, children: t, checked: n, ...s }, i) => /* @__PURE__ */ a.jsxs(
  e.CheckboxItem,
  {
    ref: i,
    className: r(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      o
    ),
    checked: n,
    ...s,
    children: [
      /* @__PURE__ */ a.jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ a.jsx(e.ItemIndicator, { children: /* @__PURE__ */ a.jsx(l, { className: "h-4 w-4" }) }) }),
      t
    ]
  }
));
g.displayName = e.CheckboxItem.displayName;
const w = d.forwardRef(({ className: o, children: t, ...n }, s) => /* @__PURE__ */ a.jsxs(
  e.RadioItem,
  {
    ref: s,
    className: r(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      o
    ),
    ...n,
    children: [
      /* @__PURE__ */ a.jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ a.jsx(e.ItemIndicator, { children: /* @__PURE__ */ a.jsx(m, { className: "h-2 w-2 fill-current" }) }) }),
      t
    ]
  }
));
w.displayName = e.RadioItem.displayName;
const b = d.forwardRef(({ className: o, inset: t, ...n }, s) => /* @__PURE__ */ a.jsx(
  e.Label,
  {
    ref: s,
    className: r(
      "px-2 py-1.5 text-sm font-semibold",
      t && "pl-8",
      o
    ),
    ...n
  }
));
b.displayName = e.Label.displayName;
const h = d.forwardRef(({ className: o, ...t }, n) => /* @__PURE__ */ a.jsx(
  e.Separator,
  {
    ref: n,
    className: r("-mx-1 my-1 h-px bg-muted", o),
    ...t
  }
));
h.displayName = e.Separator.displayName;
const N = ({
  className: o,
  ...t
}) => /* @__PURE__ */ a.jsx(
  "span",
  {
    className: r("ml-auto text-xs tracking-widest opacity-60", o),
    ...t
  }
);
N.displayName = "DropdownMenuShortcut";
export {
  D as DropdownMenu,
  g as DropdownMenuCheckboxItem,
  f as DropdownMenuContent,
  R as DropdownMenuGroup,
  x as DropdownMenuItem,
  b as DropdownMenuLabel,
  I as DropdownMenuPortal,
  C as DropdownMenuRadioGroup,
  w as DropdownMenuRadioItem,
  h as DropdownMenuSeparator,
  N as DropdownMenuShortcut,
  S as DropdownMenuSub,
  u as DropdownMenuSubContent,
  p as DropdownMenuSubTrigger,
  M as DropdownMenuTrigger
};
//# sourceMappingURL=index.es23.js.map
