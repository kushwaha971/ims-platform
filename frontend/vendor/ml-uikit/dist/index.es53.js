import { j as r } from "./index.es62.js";
import { useTheme as e } from "next-themes";
import { Toaster as s } from "sonner";
const p = ({ ...t }) => {
  const { theme: o = "system" } = e();
  return /* @__PURE__ */ r.jsx(
    s,
    {
      theme: o,
      className: "toaster group",
      toastOptions: {
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...t
    }
  );
};
export {
  p as Toaster
};
//# sourceMappingURL=index.es53.js.map
