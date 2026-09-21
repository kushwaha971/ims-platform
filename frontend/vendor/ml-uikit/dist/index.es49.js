import { j as s } from "./index.es62.js";
import * as r from "react";
import * as e from "@radix-ui/react-dialog";
import { cva as m } from "class-variance-authority";
import { X as c } from "lucide-react";
import { cn as i } from "./index.es63.js";
const v = e.Root, w = e.Trigger, C = e.Close, f = e.Portal, n = r.forwardRef(({ className: t, ...a }, o) => /* @__PURE__ */ s.jsx(
  e.Overlay,
  {
    className: i(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      t
    ),
    ...a,
    ref: o
  }
));
n.displayName = e.Overlay.displayName;
const p = m(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm"
      }
    },
    defaultVariants: {
      side: "right"
    }
  }
), x = r.forwardRef(({ side: t = "right", className: a, children: o, ...d }, l) => /* @__PURE__ */ s.jsxs(f, { children: [
  /* @__PURE__ */ s.jsx(n, {}),
  /* @__PURE__ */ s.jsxs(
    e.Content,
    {
      ref: l,
      className: i(p({ side: t }), a),
      ...d,
      children: [
        /* @__PURE__ */ s.jsxs(e.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary", children: [
          /* @__PURE__ */ s.jsx(c, { className: "h-4 w-4" }),
          /* @__PURE__ */ s.jsx("span", { className: "sr-only", children: "Close" })
        ] }),
        o
      ]
    }
  )
] }));
x.displayName = e.Content.displayName;
const h = ({
  className: t,
  ...a
}) => /* @__PURE__ */ s.jsx(
  "div",
  {
    className: i(
      "flex flex-col space-y-2 text-center sm:text-left",
      t
    ),
    ...a
  }
);
h.displayName = "SheetHeader";
const g = ({
  className: t,
  ...a
}) => /* @__PURE__ */ s.jsx(
  "div",
  {
    className: i(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      t
    ),
    ...a
  }
);
g.displayName = "SheetFooter";
const u = r.forwardRef(({ className: t, ...a }, o) => /* @__PURE__ */ s.jsx(
  e.Title,
  {
    ref: o,
    className: i("text-lg font-semibold text-foreground", t),
    ...a
  }
));
u.displayName = e.Title.displayName;
const y = r.forwardRef(({ className: t, ...a }, o) => /* @__PURE__ */ s.jsx(
  e.Description,
  {
    ref: o,
    className: i("text-sm text-muted-foreground", t),
    ...a
  }
));
y.displayName = e.Description.displayName;
export {
  v as Sheet,
  C as SheetClose,
  x as SheetContent,
  y as SheetDescription,
  g as SheetFooter,
  h as SheetHeader,
  n as SheetOverlay,
  f as SheetPortal,
  u as SheetTitle,
  w as SheetTrigger
};
//# sourceMappingURL=index.es49.js.map
