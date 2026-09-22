import { j as r } from "./index.es62.js";
import { cva as o } from "class-variance-authority";
import { cn as e } from "./index.es63.js";
import { Button as u } from "./index.es10.js";
import { Input as p } from "./index.es29.js";
import { Textarea as d } from "./index.es58.js";
function v({ className: a, ...t }) {
  return /* @__PURE__ */ r.jsx(
    "div",
    {
      "data-slot": "input-group",
      role: "group",
      className: e(
        "group/input-group relative flex w-full items-center rounded-[8px] border border-border-subtle bg-surface-card text-[14px] leading-[20px] text-foreground transition-colors",
        "h-10 has-[>textarea]:h-auto",
        // Variants based on alignment.
        "has-[>[data-align=inline-start]]:[&>input]:pl-2",
        "has-[>[data-align=inline-end]]:[&>input]:pr-2",
        "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3",
        "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3",
        // Focus state.
        "focus-within:border-text-primary",
        // Error state.
        "has-[[data-slot][aria-invalid=true]]:border-formError",
        // Disabled state.
        "data-[disabled=true]:cursor-not-allowed data-[disabled=true]:bg-surface-sunken data-[disabled=true]:text-text-muted",
        a
      ),
      ...t
    }
  );
}
const l = o(
  "flex h-auto cursor-text select-none items-center justify-center gap-2 py-1.5 text-sm font-medium text-text-tertiary group-data-[disabled=true]/input-group:text-text-muted [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
        "inline-end": "order-last pr-3 has-[>button]:mr-[-0.4rem] has-[>kbd]:mr-[-0.35rem]",
        "block-start": "[.border-b]:pb-3 order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-2.5",
        "block-end": "[.border-t]:pt-3 order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-2.5"
      }
    },
    defaultVariants: {
      align: "inline-start"
    }
  }
);
function k({
  className: a,
  align: t = "inline-start",
  ...s
}) {
  return /* @__PURE__ */ r.jsx(
    "div",
    {
      role: "group",
      "data-slot": "input-group-addon",
      "data-align": t,
      className: e(l({ align: t }), a),
      onClick: (n) => {
        n.target.closest("button") || n.currentTarget.parentElement?.querySelector("input")?.focus();
      },
      ...s
    }
  );
}
const c = o(
  "flex items-center gap-2 text-sm shadow-none",
  {
    variants: {
      size: {
        xs: "h-6 gap-1 rounded-[calc(var(--radius)-5px)] px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5",
        "icon-xs": "size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0",
        "icon-sm": "size-8 p-0 has-[>svg]:p-0"
      }
    },
    defaultVariants: {
      size: "xs"
    }
  }
);
function j({
  className: a,
  type: t = "button",
  variant: s = "ghost",
  size: n = "xs",
  ...i
}) {
  return /* @__PURE__ */ r.jsx(
    u,
    {
      type: t,
      "data-size": n,
      variant: s,
      className: e(c({ size: n }), a),
      ...i
    }
  );
}
function z({ className: a, ...t }) {
  return /* @__PURE__ */ r.jsx(
    "span",
    {
      className: e(
        "text-muted-foreground flex items-center gap-2 text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
        a
      ),
      ...t
    }
  );
}
function w({
  className: a,
  ...t
}) {
  return /* @__PURE__ */ r.jsx(
    p,
    {
      "data-slot": "input-group-control",
      className: e(
        "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
        a
      ),
      ...t
    }
  );
}
function G({
  className: a,
  ...t
}) {
  return /* @__PURE__ */ r.jsx(
    d,
    {
      "data-slot": "input-group-control",
      className: e(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent",
        a
      ),
      ...t
    }
  );
}
export {
  v as InputGroup,
  k as InputGroupAddon,
  j as InputGroupButton,
  w as InputGroupInput,
  z as InputGroupText,
  G as InputGroupTextarea
};
//# sourceMappingURL=index.es32.js.map
