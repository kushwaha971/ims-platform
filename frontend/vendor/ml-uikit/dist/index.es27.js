import { j as i } from "./index.es62.js";
import * as m from "react";
import { Slot as u } from "@radix-ui/react-slot";
import { FormProvider as F, useFormContext as x, Controller as p } from "react-hook-form";
import { cn as d } from "./index.es63.js";
import { Label as I } from "./index.es38.js";
const $ = F, l = m.createContext(null), D = ({
  ...e
}) => /* @__PURE__ */ i.jsx(l.Provider, { value: { name: e.name }, children: /* @__PURE__ */ i.jsx(p, { ...e }) }), a = () => {
  const e = m.useContext(l), r = m.useContext(f), { getFieldState: o, formState: t } = x();
  if (!e)
    throw new Error("useFormField should be used within <FormField>");
  if (!r)
    throw new Error("useFormField should be used within <FormItem>");
  const s = o(e.name, t), { id: n } = r;
  return {
    id: n,
    name: e.name,
    formItemId: `${n}-form-item`,
    formDescriptionId: `${n}-form-item-description`,
    formMessageId: `${n}-form-item-message`,
    ...s
  };
}, f = m.createContext(null), C = m.forwardRef(({ className: e, ...r }, o) => {
  const t = m.useId();
  return /* @__PURE__ */ i.jsx(f.Provider, { value: { id: t }, children: /* @__PURE__ */ i.jsx("div", { ref: o, className: d("space-y-2", e), ...r }) });
});
C.displayName = "FormItem";
const w = m.forwardRef(({ className: e, ...r }, o) => {
  const { error: t, formItemId: s } = a();
  return /* @__PURE__ */ i.jsx(
    I,
    {
      ref: o,
      className: d(t && "text-destructive", e),
      htmlFor: s,
      ...r
    }
  );
});
w.displayName = "FormLabel";
const g = m.forwardRef(({ ...e }, r) => {
  const { error: o, formItemId: t, formDescriptionId: s, formMessageId: n } = a();
  return /* @__PURE__ */ i.jsx(
    u,
    {
      ref: r,
      id: t,
      "aria-describedby": o ? `${s} ${n}` : `${s}`,
      "aria-invalid": !!o,
      ...e
    }
  );
});
g.displayName = "FormControl";
const h = m.forwardRef(({ className: e, ...r }, o) => {
  const { formDescriptionId: t } = a();
  return /* @__PURE__ */ i.jsx(
    "p",
    {
      ref: o,
      id: t,
      className: d("text-[0.8rem] text-muted-foreground", e),
      ...r
    }
  );
});
h.displayName = "FormDescription";
const j = m.forwardRef(({ className: e, children: r, ...o }, t) => {
  const { error: s, formMessageId: n } = a(), c = s ? String(s?.message ?? "") : r;
  return c ? /* @__PURE__ */ i.jsx(
    "p",
    {
      ref: t,
      id: n,
      className: d("text-[0.8rem] font-medium text-destructive", e),
      ...o,
      children: c
    }
  ) : null;
});
j.displayName = "FormMessage";
export {
  $ as Form,
  g as FormControl,
  h as FormDescription,
  D as FormField,
  C as FormItem,
  w as FormLabel,
  j as FormMessage,
  a as useFormField
};
//# sourceMappingURL=index.es27.js.map
