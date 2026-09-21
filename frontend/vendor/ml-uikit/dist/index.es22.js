import { j as t } from "./index.es62.js";
import * as l from "react";
import { Drawer as a } from "vaul";
import { cn as o } from "./index.es63.js";
const d = ({
  shouldScaleBackground: e = !0,
  ...r
}) => /* @__PURE__ */ t.jsx(
  a.Root,
  {
    shouldScaleBackground: e,
    ...r
  }
);
d.displayName = "Drawer";
const y = a.Trigger, n = a.Portal, j = a.Close, i = l.forwardRef(({ className: e, ...r }, s) => /* @__PURE__ */ t.jsx(
  a.Overlay,
  {
    ref: s,
    className: o("fixed inset-0 z-50 bg-black/80", e),
    ...r
  }
));
i.displayName = a.Overlay.displayName;
const c = l.forwardRef(({ className: e, children: r, ...s }, m) => /* @__PURE__ */ t.jsxs(n, { children: [
  /* @__PURE__ */ t.jsx(i, {}),
  /* @__PURE__ */ t.jsxs(
    a.Content,
    {
      ref: m,
      className: o(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
        e
      ),
      ...s,
      children: [
        /* @__PURE__ */ t.jsx("div", { className: "mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" }),
        r
      ]
    }
  )
] }));
c.displayName = "DrawerContent";
const x = ({
  className: e,
  ...r
}) => /* @__PURE__ */ t.jsx(
  "div",
  {
    className: o("grid gap-1.5 p-4 text-center sm:text-left", e),
    ...r
  }
);
x.displayName = "DrawerHeader";
const p = ({
  className: e,
  ...r
}) => /* @__PURE__ */ t.jsx(
  "div",
  {
    className: o("mt-auto flex flex-col gap-2 p-4", e),
    ...r
  }
);
p.displayName = "DrawerFooter";
const f = l.forwardRef(({ className: e, ...r }, s) => /* @__PURE__ */ t.jsx(
  a.Title,
  {
    ref: s,
    className: o(
      "text-lg font-semibold leading-none tracking-tight",
      e
    ),
    ...r
  }
));
f.displayName = a.Title.displayName;
const w = l.forwardRef(({ className: e, ...r }, s) => /* @__PURE__ */ t.jsx(
  a.Description,
  {
    ref: s,
    className: o("text-sm text-muted-foreground", e),
    ...r
  }
));
w.displayName = a.Description.displayName;
export {
  d as Drawer,
  j as DrawerClose,
  c as DrawerContent,
  w as DrawerDescription,
  p as DrawerFooter,
  x as DrawerHeader,
  i as DrawerOverlay,
  n as DrawerPortal,
  f as DrawerTitle,
  y as DrawerTrigger
};
//# sourceMappingURL=index.es22.js.map
