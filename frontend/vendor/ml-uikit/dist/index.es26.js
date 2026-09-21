import { j as a } from "./index.es62.js";
import { useMemo as n } from "react";
import { cva as f } from "class-variance-authority";
import { cn as o } from "./index.es63.js";
import { Label as u } from "./index.es38.js";
import { Separator as c } from "./index.es48.js";
function j({ className: t, ...e }) {
  return /* @__PURE__ */ a.jsx(
    "fieldset",
    {
      "data-slot": "field-set",
      className: o(
        "flex flex-col gap-6",
        "has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        t
      ),
      ...e
    }
  );
}
function w({
  className: t,
  variant: e = "legend",
  ...l
}) {
  return /* @__PURE__ */ a.jsx(
    "legend",
    {
      "data-slot": "field-legend",
      "data-variant": e,
      className: o(
        "mb-3 font-medium",
        "data-[variant=legend]:text-base",
        "data-[variant=label]:text-sm",
        t
      ),
      ...l
    }
  );
}
function N({ className: t, ...e }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "field-group",
      className: o(
        "group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
        t
      ),
      ...e
    }
  );
}
const m = f(
  "group/field data-[invalid=true]:text-destructive flex w-full gap-3",
  {
    variants: {
      orientation: {
        vertical: ["flex-col [&>*]:w-full [&>.sr-only]:w-auto"],
        horizontal: [
          "flex-row items-center",
          "[&>[data-slot=field-label]]:flex-auto",
          "has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px has-[>[data-slot=field-content]]:items-start"
        ],
        responsive: [
          "@md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto flex-col [&>*]:w-full [&>.sr-only]:w-auto",
          "@md/field-group:[&>[data-slot=field-label]]:flex-auto",
          "@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
        ]
      }
    },
    defaultVariants: {
      orientation: "vertical"
    }
  }
);
function k({
  className: t,
  orientation: e = "vertical",
  ...l
}) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      role: "group",
      "data-slot": "field",
      "data-orientation": e,
      className: o(m({ orientation: e }), t),
      ...l
    }
  );
}
function F({ className: t, ...e }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "field-content",
      className: o(
        "group/field-content flex flex-1 flex-col gap-1.5 leading-snug",
        t
      ),
      ...e
    }
  );
}
function y({
  className: t,
  ...e
}) {
  return /* @__PURE__ */ a.jsx(
    u,
    {
      "data-slot": "field-label",
      className: o(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>[data-slot=field]]:p-4",
        "has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:border-primary dark:has-data-[state=checked]:bg-primary/10",
        t
      ),
      ...e
    }
  );
}
function L({ className: t, ...e }) {
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      "data-slot": "field-label",
      className: o(
        "flex w-fit items-center gap-2 text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50",
        t
      ),
      ...e
    }
  );
}
function S({ className: t, ...e }) {
  return /* @__PURE__ */ a.jsx(
    "p",
    {
      "data-slot": "field-description",
      className: o(
        "text-muted-foreground text-sm font-normal leading-normal group-has-[[data-orientation=horizontal]]/field:text-balance",
        "nth-last-2:-mt-1 last:mt-0 [[data-variant=legend]+&]:-mt-1.5",
        "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        t
      ),
      ...e
    }
  );
}
function z({
  children: t,
  className: e,
  ...l
}) {
  return /* @__PURE__ */ a.jsxs(
    "div",
    {
      "data-slot": "field-separator",
      "data-content": !!t,
      className: o(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        e
      ),
      ...l,
      children: [
        /* @__PURE__ */ a.jsx(c, { className: "absolute inset-0 top-1/2" }),
        t && /* @__PURE__ */ a.jsx(
          "span",
          {
            className: "bg-background text-muted-foreground relative mx-auto block w-fit px-2",
            "data-slot": "field-separator-content",
            children: t
          }
        )
      ]
    }
  );
}
function E({
  className: t,
  children: e,
  errors: l,
  ...r
}) {
  const d = n(() => e || (l ? l?.length === 1 && l[0]?.message ? l[0].message : /* @__PURE__ */ a.jsx("ul", { className: "ml-4 flex list-disc flex-col gap-1", children: l.map(
    (i, s) => i?.message && /* @__PURE__ */ a.jsx("li", { children: i.message }, s)
  ) }) : null), [e, l]);
  return d ? /* @__PURE__ */ a.jsx(
    "div",
    {
      role: "alert",
      "data-slot": "field-error",
      className: o("text-destructive text-sm font-normal", t),
      ...r,
      children: d
    }
  ) : null;
}
export {
  k as Field,
  F as FieldContent,
  S as FieldDescription,
  E as FieldError,
  N as FieldGroup,
  y as FieldLabel,
  w as FieldLegend,
  z as FieldSeparator,
  j as FieldSet,
  L as FieldTitle
};
//# sourceMappingURL=index.es26.js.map
