import { j as t } from "./index.es62.js";
import * as m from "react";
import { Command as o } from "cmdk";
import { Search as n } from "lucide-react";
import { cn as r } from "./index.es63.js";
import { Dialog as p, DialogContent as i } from "./index.es21.js";
const s = m.forwardRef(({ className: e, ...a }, d) => /* @__PURE__ */ t.jsx(
  o,
  {
    ref: d,
    className: r(
      "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
      e
    ),
    ...a
  }
));
s.displayName = o.displayName;
const v = ({ children: e, ...a }) => /* @__PURE__ */ t.jsx(p, { ...a, children: /* @__PURE__ */ t.jsx(i, { className: "overflow-hidden p-0", children: /* @__PURE__ */ t.jsx(s, { className: "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5", children: e }) }) }), c = m.forwardRef(({ className: e, ...a }, d) => /* @__PURE__ */ t.jsxs("div", { className: "flex items-center border-b px-3", "cmdk-input-wrapper": "", children: [
  /* @__PURE__ */ t.jsx(n, { className: "mr-2 h-4 w-4 shrink-0 opacity-50" }),
  /* @__PURE__ */ t.jsx(
    o.Input,
    {
      ref: d,
      className: r(
        "flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        e
      ),
      ...a
    }
  )
] }));
c.displayName = o.Input.displayName;
const l = m.forwardRef(({ className: e, ...a }, d) => /* @__PURE__ */ t.jsx(
  o.List,
  {
    ref: d,
    className: r("max-h-[300px] overflow-y-auto overflow-x-hidden", e),
    ...a
  }
));
l.displayName = o.List.displayName;
const u = m.forwardRef((e, a) => /* @__PURE__ */ t.jsx(
  o.Empty,
  {
    ref: a,
    className: "py-6 text-center text-sm",
    ...e
  }
));
u.displayName = o.Empty.displayName;
const x = m.forwardRef(({ className: e, ...a }, d) => /* @__PURE__ */ t.jsx(
  o.Group,
  {
    ref: d,
    className: r(
      "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
      e
    ),
    ...a
  }
));
x.displayName = o.Group.displayName;
const f = m.forwardRef(({ className: e, ...a }, d) => /* @__PURE__ */ t.jsx(
  o.Separator,
  {
    ref: d,
    className: r("-mx-1 h-px bg-border", e),
    ...a
  }
));
f.displayName = o.Separator.displayName;
const g = m.forwardRef(({ className: e, ...a }, d) => /* @__PURE__ */ t.jsx(
  o.Item,
  {
    ref: d,
    className: r(
      "relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      e
    ),
    ...a
  }
));
g.displayName = o.Item.displayName;
const h = ({
  className: e,
  ...a
}) => /* @__PURE__ */ t.jsx(
  "span",
  {
    className: r(
      "ml-auto text-xs tracking-widest text-muted-foreground",
      e
    ),
    ...a
  }
);
h.displayName = "CommandShortcut";
export {
  s as Command,
  v as CommandDialog,
  u as CommandEmpty,
  x as CommandGroup,
  c as CommandInput,
  g as CommandItem,
  l as CommandList,
  f as CommandSeparator,
  h as CommandShortcut
};
//# sourceMappingURL=index.es19.js.map
