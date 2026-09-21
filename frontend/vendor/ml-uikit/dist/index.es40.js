import { j as a } from "./index.es62.js";
import * as d from "react";
import * as t from "@radix-ui/react-menubar";
import { Check as m, Circle as l, ChevronRight as u } from "lucide-react";
import { cn as s } from "./index.es63.js";
function S({
  ...e
}) {
  return /* @__PURE__ */ a.jsx(t.Menu, { ...e });
}
function C({
  ...e
}) {
  return /* @__PURE__ */ a.jsx(t.Group, { ...e });
}
function k({
  ...e
}) {
  return /* @__PURE__ */ a.jsx(t.Portal, { ...e });
}
function z({
  ...e
}) {
  return /* @__PURE__ */ a.jsx(t.RadioGroup, { ...e });
}
function T({
  ...e
}) {
  return /* @__PURE__ */ a.jsx(t.Sub, { "data-slot": "menubar-sub", ...e });
}
const f = d.forwardRef(({ className: e, ...o }, n) => /* @__PURE__ */ a.jsx(
  t.Root,
  {
    ref: n,
    className: s(
      "flex h-9 items-center space-x-1 rounded-md border bg-background p-1 shadow-sm",
      e
    ),
    ...o
  }
));
f.displayName = t.Root.displayName;
const p = d.forwardRef(({ className: e, ...o }, n) => /* @__PURE__ */ a.jsx(
  t.Trigger,
  {
    ref: n,
    className: s(
      "flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
      e
    ),
    ...o
  }
));
p.displayName = t.Trigger.displayName;
const x = d.forwardRef(({ className: e, inset: o, children: n, ...r }, i) => /* @__PURE__ */ a.jsxs(
  t.SubTrigger,
  {
    ref: i,
    className: s(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
      o && "pl-8",
      e
    ),
    ...r,
    children: [
      n,
      /* @__PURE__ */ a.jsx(u, { className: "ml-auto h-4 w-4" })
    ]
  }
));
x.displayName = t.SubTrigger.displayName;
const b = d.forwardRef(({ className: e, ...o }, n) => /* @__PURE__ */ a.jsx(
  t.SubContent,
  {
    ref: n,
    className: s(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-menubar-content-transform-origin]",
      e
    ),
    ...o
  }
));
b.displayName = t.SubContent.displayName;
const g = d.forwardRef(
  ({ className: e, align: o = "start", alignOffset: n = -4, sideOffset: r = 8, ...i }, c) => /* @__PURE__ */ a.jsx(t.Portal, { children: /* @__PURE__ */ a.jsx(
    t.Content,
    {
      ref: c,
      align: o,
      alignOffset: n,
      sideOffset: r,
      className: s(
        "z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-menubar-content-transform-origin]",
        e
      ),
      ...i
    }
  ) })
);
g.displayName = t.Content.displayName;
const N = d.forwardRef(({ className: e, inset: o, ...n }, r) => /* @__PURE__ */ a.jsx(
  t.Item,
  {
    ref: r,
    className: s(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      o && "pl-8",
      e
    ),
    ...n
  }
));
N.displayName = t.Item.displayName;
const y = d.forwardRef(({ className: e, children: o, checked: n, ...r }, i) => /* @__PURE__ */ a.jsxs(
  t.CheckboxItem,
  {
    ref: i,
    className: s(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      e
    ),
    checked: n,
    ...r,
    children: [
      /* @__PURE__ */ a.jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ a.jsx(t.ItemIndicator, { children: /* @__PURE__ */ a.jsx(m, { className: "h-4 w-4" }) }) }),
      o
    ]
  }
));
y.displayName = t.CheckboxItem.displayName;
const h = d.forwardRef(({ className: e, children: o, ...n }, r) => /* @__PURE__ */ a.jsxs(
  t.RadioItem,
  {
    ref: r,
    className: s(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      e
    ),
    ...n,
    children: [
      /* @__PURE__ */ a.jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ a.jsx(t.ItemIndicator, { children: /* @__PURE__ */ a.jsx(l, { className: "h-4 w-4 fill-current" }) }) }),
      o
    ]
  }
));
h.displayName = t.RadioItem.displayName;
const j = d.forwardRef(({ className: e, inset: o, ...n }, r) => /* @__PURE__ */ a.jsx(
  t.Label,
  {
    ref: r,
    className: s(
      "px-2 py-1.5 text-sm font-semibold",
      o && "pl-8",
      e
    ),
    ...n
  }
));
j.displayName = t.Label.displayName;
const w = d.forwardRef(({ className: e, ...o }, n) => /* @__PURE__ */ a.jsx(
  t.Separator,
  {
    ref: n,
    className: s("-mx-1 my-1 h-px bg-muted", e),
    ...o
  }
));
w.displayName = t.Separator.displayName;
const M = ({
  className: e,
  ...o
}) => /* @__PURE__ */ a.jsx(
  "span",
  {
    className: s(
      "ml-auto text-xs tracking-widest text-muted-foreground",
      e
    ),
    ...o
  }
);
M.displayname = "MenubarShortcut";
export {
  f as Menubar,
  y as MenubarCheckboxItem,
  g as MenubarContent,
  C as MenubarGroup,
  N as MenubarItem,
  j as MenubarLabel,
  S as MenubarMenu,
  k as MenubarPortal,
  z as MenubarRadioGroup,
  h as MenubarRadioItem,
  w as MenubarSeparator,
  M as MenubarShortcut,
  T as MenubarSub,
  b as MenubarSubContent,
  x as MenubarSubTrigger,
  p as MenubarTrigger
};
//# sourceMappingURL=index.es40.js.map
