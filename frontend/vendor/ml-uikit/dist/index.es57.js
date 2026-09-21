import { j as s } from "./index.es62.js";
import * as o from "react";
import * as e from "@radix-ui/react-tabs";
import { cn as r } from "./index.es63.js";
const d = e.Root, n = o.forwardRef(({ className: t, ...a }, i) => /* @__PURE__ */ s.jsx(
  e.List,
  {
    ref: i,
    className: r(
      "flex w-full flex-wrap items-center gap-1 rounded-[8px] bg-[#f5f5f5] p-1",
      "data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start",
      t
    ),
    ...a
  }
));
n.displayName = e.List.displayName;
const l = o.forwardRef(({ className: t, ...a }, i) => /* @__PURE__ */ s.jsx(
  e.Trigger,
  {
    ref: i,
    className: r(
      "inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-[8px] border border-transparent bg-transparent px-2 font-['Inter'] text-[16px] not-italic font-medium leading-[24px] [color:var(--raw-black,#000)] transition-colors",
      "[&_svg]:size-3.5",
      "hover:[color:var(--raw-black,#000)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1C20] focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:bg-[#f2f2f2] disabled:text-[#b3b3b3]",
      "data-[state=active]:bg-white data-[state=active]:shadow-[0_2px_4px_-2px_rgba(19,25,39,0.12),_0_4px_4px_-2px_rgba(19,25,39,0.08)]",
      t
    ),
    ...a
  }
));
l.displayName = e.Trigger.displayName;
const f = o.forwardRef(({ className: t, ...a }, i) => /* @__PURE__ */ s.jsx(
  e.Content,
  {
    ref: i,
    className: r(
      "mt-4 font-['Inter'] text-[16px] not-italic font-medium leading-[24px] [color:var(--raw-black,#000)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1C20] focus-visible:ring-offset-2",
      t
    ),
    ...a
  }
));
f.displayName = e.Content.displayName;
export {
  d as Tabs,
  f as TabsContent,
  n as TabsList,
  l as TabsTrigger
};
//# sourceMappingURL=index.es57.js.map
