import { j as t } from "./index.es62.js";
import * as n from "react";
import * as e from "@radix-ui/react-accordion";
import { ChevronDown as m } from "lucide-react";
import { cn as i } from "./index.es63.js";
const N = e.Root, d = n.forwardRef(({ className: o, ...r }, a) => /* @__PURE__ */ t.jsx(
  e.Item,
  {
    ref: a,
    className: i("border-b", o),
    ...r
  }
));
d.displayName = "AccordionItem";
const c = n.forwardRef(({ className: o, children: r, ...a }, s) => /* @__PURE__ */ t.jsx(e.Header, { className: "flex", children: /* @__PURE__ */ t.jsxs(
  e.Trigger,
  {
    ref: s,
    className: i(
      "flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-left [&[data-state=open]>svg]:rotate-180",
      o
    ),
    ...a,
    children: [
      r,
      /* @__PURE__ */ t.jsx(m, { className: "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" })
    ]
  }
) }));
c.displayName = e.Trigger.displayName;
const l = n.forwardRef(({ className: o, children: r, ...a }, s) => /* @__PURE__ */ t.jsx(
  e.Content,
  {
    ref: s,
    className: "overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
    ...a,
    children: /* @__PURE__ */ t.jsx("div", { className: i("pb-4 pt-0", o), children: r })
  }
));
l.displayName = e.Content.displayName;
export {
  N as Accordion,
  l as AccordionContent,
  d as AccordionItem,
  c as AccordionTrigger
};
//# sourceMappingURL=index.es3.js.map
