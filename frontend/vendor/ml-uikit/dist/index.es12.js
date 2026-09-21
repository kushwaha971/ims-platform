import { j as e } from "./index.es62.js";
import { Slot as s } from "@radix-ui/react-slot";
import { cva as i } from "class-variance-authority";
import { cn as n } from "./index.es63.js";
import { Separator as l } from "./index.es48.js";
const d = i(
  "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal: "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        vertical: "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none"
      }
    },
    defaultVariants: {
      orientation: "horizontal"
    }
  }
);
function h({
  className: o,
  orientation: t,
  ...r
}) {
  return /* @__PURE__ */ e.jsx(
    "div",
    {
      role: "group",
      "data-slot": "button-group",
      "data-orientation": t,
      className: n(d({ orientation: t }), o),
      ...r
    }
  );
}
function g({
  className: o,
  asChild: t = !1,
  ...r
}) {
  const a = t ? s : "div";
  return /* @__PURE__ */ e.jsx(
    a,
    {
      className: n(
        "bg-muted shadow-xs flex items-center gap-2 rounded-md border px-4 text-sm font-medium [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
        o
      ),
      ...r
    }
  );
}
function v({
  className: o,
  orientation: t = "vertical",
  ...r
}) {
  return /* @__PURE__ */ e.jsx(
    l,
    {
      "data-slot": "button-group-separator",
      orientation: t,
      className: n(
        "bg-input relative !m-0 self-stretch data-[orientation=vertical]:h-auto",
        o
      ),
      ...r
    }
  );
}
export {
  h as ButtonGroup,
  v as ButtonGroupSeparator,
  g as ButtonGroupText,
  d as buttonGroupVariants
};
//# sourceMappingURL=index.es12.js.map
