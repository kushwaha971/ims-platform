import { j as a } from "./index.es62.js";
import { Slot as m } from "@radix-ui/react-slot";
import { cva as n } from "class-variance-authority";
import { cn as i } from "./index.es63.js";
import { Separator as d } from "./index.es48.js";
function b({ className: e, ...t }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      role: "list",
      "data-slot": "item-group",
      className: i("group/item-group flex flex-col", e),
      ...t
    }
  );
}
function j({
  className: e,
  ...t
}) {
  return /* @__PURE__ */ a.jsx(
    d,
    {
      "data-slot": "item-separator",
      orientation: "horizontal",
      className: i("my-0", e),
      ...t
    }
  );
}
const u = n(
  "group/item [a]:hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-ring/50 [a]:transition-colors flex flex-wrap items-center rounded-md border border-transparent text-sm outline-none transition-colors duration-100 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-border",
        muted: "bg-muted/50"
      },
      size: {
        default: "gap-4 p-4 ",
        sm: "gap-2.5 px-4 py-3"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function I({
  className: e,
  variant: t = "default",
  size: r = "default",
  asChild: s = !1,
  ...o
}) {
  const l = s ? m : "div";
  return /* @__PURE__ */ a.jsx(
    l,
    {
      "data-slot": "item",
      "data-variant": t,
      "data-size": r,
      className: i(u({ variant: t, size: r, className: e })),
      ...o
    }
  );
}
const f = n(
  "flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:translate-y-0.5 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "bg-muted size-8 rounded-sm border [&_svg:not([class*='size-'])]:size-4",
        image: "size-10 overflow-hidden rounded-sm [&_img]:size-full [&_img]:object-cover"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function N({
  className: e,
  variant: t = "default",
  ...r
}) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "item-media",
      "data-variant": t,
      className: i(f({ variant: t, className: e })),
      ...r
    }
  );
}
function h({ className: e, ...t }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "item-content",
      className: i(
        "flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none",
        e
      ),
      ...t
    }
  );
}
function z({ className: e, ...t }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "item-title",
      className: i(
        "flex w-fit items-center gap-2 text-sm font-medium leading-snug",
        e
      ),
      ...t
    }
  );
}
function y({ className: e, ...t }) {
  return /* @__PURE__ */ a.jsx(
    "p",
    {
      "data-slot": "item-description",
      className: i(
        "text-muted-foreground line-clamp-2 text-balance text-sm font-normal leading-normal",
        "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        e
      ),
      ...t
    }
  );
}
function w({ className: e, ...t }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "item-actions",
      className: i("flex items-center gap-2", e),
      ...t
    }
  );
}
function V({ className: e, ...t }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "item-header",
      className: i(
        "flex basis-full items-center justify-between gap-2",
        e
      ),
      ...t
    }
  );
}
function _({ className: e, ...t }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "item-footer",
      className: i(
        "flex basis-full items-center justify-between gap-2",
        e
      ),
      ...t
    }
  );
}
export {
  I as Item,
  w as ItemActions,
  h as ItemContent,
  y as ItemDescription,
  _ as ItemFooter,
  b as ItemGroup,
  V as ItemHeader,
  N as ItemMedia,
  j as ItemSeparator,
  z as ItemTitle
};
//# sourceMappingURL=index.es36.js.map
