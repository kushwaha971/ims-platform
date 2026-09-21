import { j as o } from "./index.es62.js";
import * as l from "react";
import * as a from "@radix-ui/react-dialog";
import { X as r } from "lucide-react";
import { cn as i } from "./index.es63.js";
const D = a.Root, j = a.Trigger, c = a.Portal, b = a.Close, n = l.forwardRef(({ className: e, ...t }, s) => /* @__PURE__ */ o.jsx(
  a.Overlay,
  {
    ref: s,
    className: i(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      e
    ),
    ...t
  }
));
n.displayName = a.Overlay.displayName;
const m = l.forwardRef(({ className: e, children: t, ...s }, d) => /* @__PURE__ */ o.jsxs(c, { children: [
  /* @__PURE__ */ o.jsx(n, {}),
  /* @__PURE__ */ o.jsxs(
    a.Content,
    {
      ref: d,
      className: i(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        e
      ),
      ...s,
      children: [
        t,
        /* @__PURE__ */ o.jsxs(a.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground", children: [
          /* @__PURE__ */ o.jsx(r, { className: "h-4 w-4" }),
          /* @__PURE__ */ o.jsx("span", { className: "sr-only", children: "Close" })
        ] })
      ]
    }
  )
] }));
m.displayName = a.Content.displayName;
const f = ({
  className: e,
  ...t
}) => /* @__PURE__ */ o.jsx(
  "div",
  {
    className: i(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      e
    ),
    ...t
  }
);
f.displayName = "DialogHeader";
const p = ({
  className: e,
  ...t
}) => /* @__PURE__ */ o.jsx(
  "div",
  {
    className: i(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      e
    ),
    ...t
  }
);
p.displayName = "DialogFooter";
const g = l.forwardRef(({ className: e, ...t }, s) => /* @__PURE__ */ o.jsx(
  a.Title,
  {
    ref: s,
    className: i(
      "text-lg font-semibold leading-none tracking-tight",
      e
    ),
    ...t
  }
));
g.displayName = a.Title.displayName;
const x = l.forwardRef(({ className: e, ...t }, s) => /* @__PURE__ */ o.jsx(
  a.Description,
  {
    ref: s,
    className: i("text-sm text-muted-foreground", e),
    ...t
  }
));
x.displayName = a.Description.displayName;
export {
  D as Dialog,
  b as DialogClose,
  m as DialogContent,
  x as DialogDescription,
  p as DialogFooter,
  f as DialogHeader,
  n as DialogOverlay,
  c as DialogPortal,
  g as DialogTitle,
  j as DialogTrigger
};
//# sourceMappingURL=index.es21.js.map
