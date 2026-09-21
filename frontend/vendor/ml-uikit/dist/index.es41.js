import { j as i } from "./index.es62.js";
import * as r from "react";
import * as t from "@radix-ui/react-navigation-menu";
import { cva as m } from "class-variance-authority";
import { ChevronDown as l } from "lucide-react";
import { cn as n } from "./index.es63.js";
const c = r.forwardRef(({ className: e, children: a, ...o }, s) => /* @__PURE__ */ i.jsxs(
  t.Root,
  {
    ref: s,
    className: n(
      "relative z-10 flex max-w-max flex-1 items-center justify-center",
      e
    ),
    ...o,
    children: [
      a,
      /* @__PURE__ */ i.jsx(d, {})
    ]
  }
));
c.displayName = t.Root.displayName;
const f = r.forwardRef(({ className: e, ...a }, o) => /* @__PURE__ */ i.jsx(
  t.List,
  {
    ref: o,
    className: n(
      "group flex flex-1 list-none items-center justify-center space-x-1",
      e
    ),
    ...a
  }
));
f.displayName = t.List.displayName;
const y = t.Item, u = m(
  "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=open]:text-accent-foreground data-[state=open]:bg-accent/50 data-[state=open]:hover:bg-accent data-[state=open]:focus:bg-accent"
), p = r.forwardRef(({ className: e, children: a, ...o }, s) => /* @__PURE__ */ i.jsxs(
  t.Trigger,
  {
    ref: s,
    className: n(u(), "group", e),
    ...o,
    children: [
      a,
      " ",
      /* @__PURE__ */ i.jsx(
        l,
        {
          className: "relative top-[1px] ml-1 h-3 w-3 transition duration-300 group-data-[state=open]:rotate-180",
          "aria-hidden": "true"
        }
      )
    ]
  }
));
p.displayName = t.Trigger.displayName;
const g = r.forwardRef(({ className: e, ...a }, o) => /* @__PURE__ */ i.jsx(
  t.Content,
  {
    ref: o,
    className: n(
      "left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 md:absolute md:w-auto ",
      e
    ),
    ...a
  }
));
g.displayName = t.Content.displayName;
const b = t.Link, d = r.forwardRef(({ className: e, ...a }, o) => /* @__PURE__ */ i.jsx("div", { className: n("absolute left-0 top-full flex justify-center"), children: /* @__PURE__ */ i.jsx(
  t.Viewport,
  {
    className: n(
      "origin-top-center relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 md:w-[var(--radix-navigation-menu-viewport-width)]",
      e
    ),
    ref: o,
    ...a
  }
) }));
d.displayName = t.Viewport.displayName;
const v = r.forwardRef(({ className: e, ...a }, o) => /* @__PURE__ */ i.jsx(
  t.Indicator,
  {
    ref: o,
    className: n(
      "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in",
      e
    ),
    ...a,
    children: /* @__PURE__ */ i.jsx("div", { className: "relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" })
  }
));
v.displayName = t.Indicator.displayName;
export {
  c as NavigationMenu,
  g as NavigationMenuContent,
  v as NavigationMenuIndicator,
  y as NavigationMenuItem,
  b as NavigationMenuLink,
  f as NavigationMenuList,
  p as NavigationMenuTrigger,
  d as NavigationMenuViewport,
  u as navigationMenuTriggerStyle
};
//# sourceMappingURL=index.es41.js.map
