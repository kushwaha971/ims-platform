import { j as n } from "./index.es62.js";
import { cva as s } from "class-variance-authority";
import { cn as a } from "./index.es63.js";
function d({ className: e, ...t }) {
  return /* @__PURE__ */ n.jsx(
    "div",
    {
      "data-slot": "empty",
      className: a(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 text-balance rounded-lg border-dashed p-6 text-center md:p-12",
        e
      ),
      ...t
    }
  );
}
function c({ className: e, ...t }) {
  return /* @__PURE__ */ n.jsx(
    "div",
    {
      "data-slot": "empty-header",
      className: a(
        "flex max-w-sm flex-col items-center gap-2 text-center",
        e
      ),
      ...t
    }
  );
}
const i = s(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function f({
  className: e,
  variant: t = "default",
  ...r
}) {
  return /* @__PURE__ */ n.jsx(
    "div",
    {
      "data-slot": "empty-icon",
      "data-variant": t,
      className: a(i({ variant: t, className: e })),
      ...r
    }
  );
}
function x({ className: e, ...t }) {
  return /* @__PURE__ */ n.jsx(
    "div",
    {
      "data-slot": "empty-title",
      className: a("text-lg font-medium tracking-tight", e),
      ...t
    }
  );
}
function u({ className: e, ...t }) {
  return /* @__PURE__ */ n.jsx(
    "div",
    {
      "data-slot": "empty-description",
      className: a(
        "text-muted-foreground [&>a:hover]:text-primary text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4",
        e
      ),
      ...t
    }
  );
}
function p({ className: e, ...t }) {
  return /* @__PURE__ */ n.jsx(
    "div",
    {
      "data-slot": "empty-content",
      className: a(
        "flex w-full min-w-0 max-w-sm flex-col items-center gap-4 text-balance text-sm",
        e
      ),
      ...t
    }
  );
}
export {
  d as Empty,
  p as EmptyContent,
  u as EmptyDescription,
  c as EmptyHeader,
  f as EmptyMedia,
  x as EmptyTitle
};
//# sourceMappingURL=index.es25.js.map
