import { j as s } from "./index.es62.js";
import * as i from "react";
import * as e from "@radix-ui/react-alert-dialog";
import { cn as l } from "./index.es63.js";
import { buttonVariants as r } from "./index.es10.js";
const D = e.Root, j = e.Trigger, n = e.Portal, d = i.forwardRef(({ className: a, ...t }, o) => /* @__PURE__ */ s.jsx(
  e.Overlay,
  {
    className: l(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      a
    ),
    ...t,
    ref: o
  }
));
d.displayName = e.Overlay.displayName;
const m = i.forwardRef(({ className: a, ...t }, o) => /* @__PURE__ */ s.jsxs(n, { children: [
  /* @__PURE__ */ s.jsx(d, {}),
  /* @__PURE__ */ s.jsx(
    e.Content,
    {
      ref: o,
      className: l(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        a
      ),
      ...t
    }
  )
] }));
m.displayName = e.Content.displayName;
const c = ({
  className: a,
  ...t
}) => /* @__PURE__ */ s.jsx(
  "div",
  {
    className: l(
      "flex flex-col space-y-2 text-center sm:text-left",
      a
    ),
    ...t
  }
);
c.displayName = "AlertDialogHeader";
const f = ({
  className: a,
  ...t
}) => /* @__PURE__ */ s.jsx(
  "div",
  {
    className: l(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      a
    ),
    ...t
  }
);
f.displayName = "AlertDialogFooter";
const p = i.forwardRef(({ className: a, ...t }, o) => /* @__PURE__ */ s.jsx(
  e.Title,
  {
    ref: o,
    className: l("text-lg font-semibold", a),
    ...t
  }
));
p.displayName = e.Title.displayName;
const g = i.forwardRef(({ className: a, ...t }, o) => /* @__PURE__ */ s.jsx(
  e.Description,
  {
    ref: o,
    className: l("text-sm text-muted-foreground", a),
    ...t
  }
));
g.displayName = e.Description.displayName;
const x = i.forwardRef(({ className: a, ...t }, o) => /* @__PURE__ */ s.jsx(
  e.Action,
  {
    ref: o,
    className: l(r(), a),
    ...t
  }
));
x.displayName = e.Action.displayName;
const N = i.forwardRef(({ className: a, ...t }, o) => /* @__PURE__ */ s.jsx(
  e.Cancel,
  {
    ref: o,
    className: l(
      r({ variant: "outline" }),
      "mt-2 sm:mt-0",
      a
    ),
    ...t
  }
));
N.displayName = e.Cancel.displayName;
export {
  D as AlertDialog,
  x as AlertDialogAction,
  N as AlertDialogCancel,
  m as AlertDialogContent,
  g as AlertDialogDescription,
  f as AlertDialogFooter,
  c as AlertDialogHeader,
  d as AlertDialogOverlay,
  n as AlertDialogPortal,
  p as AlertDialogTitle,
  j as AlertDialogTrigger
};
//# sourceMappingURL=index.es5.js.map
