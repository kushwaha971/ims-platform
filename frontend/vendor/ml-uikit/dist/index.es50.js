import { j as r } from "./index.es62.js";
import * as i from "react";
import { Slot as h } from "@radix-ui/react-slot";
import { cva as R } from "class-variance-authority";
import { PanelLeft as C } from "lucide-react";
import { cn as s } from "./index.es63.js";
import { Button as I } from "./index.es10.js";
import { Input as _ } from "./index.es29.js";
import { Separator as E } from "./index.es48.js";
import { Sheet as z, SheetContent as T, SheetHeader as B, SheetTitle as O, SheetDescription as A } from "./index.es49.js";
import { Skeleton as N } from "./index.es51.js";
import { Tooltip as D, TooltipTrigger as L, TooltipContent as G, TooltipProvider as H } from "./index.es61.js";
const K = "sidebar_state", P = 3600 * 24 * 7, $ = "15rem", V = "15rem", W = "4.5rem", q = 1024, F = "b";
function U() {
  const [a, t] = i.useState(void 0);
  return i.useEffect(() => {
    const e = window.matchMedia(`(max-width: ${q - 1}px)`), o = () => {
      t(e.matches);
    };
    return o(), typeof e.addEventListener == "function" ? (e.addEventListener("change", o), () => e.removeEventListener("change", o)) : (e.addListener(o), () => e.removeListener(o));
  }, []), !!a;
}
const j = i.createContext(null);
function S() {
  const a = i.useContext(j);
  if (!a)
    throw new Error("useSidebar must be used within a SidebarProvider.");
  return a;
}
const X = i.forwardRef(
  ({
    defaultOpen: a = !0,
    open: t,
    onOpenChange: e,
    className: o,
    style: n,
    children: d,
    ...c
  }, g) => {
    const l = U(), [u, f] = i.useState(!1), [m, k] = i.useState(a), x = t ?? m, v = i.useCallback(
      (b) => {
        const p = typeof b == "function" ? b(x) : b;
        e ? e(p) : k(p), document.cookie = `${K}=${p}; path=/; max-age=${P}`;
      },
      [e, x]
    ), w = i.useCallback(() => l ? f((b) => !b) : v((b) => !b), [l, v, f]);
    i.useEffect(() => {
      const b = (p) => {
        p.key === F && (p.metaKey || p.ctrlKey) && (p.preventDefault(), w());
      };
      return window.addEventListener("keydown", b), () => window.removeEventListener("keydown", b);
    }, [w]);
    const y = x ? "expanded" : "collapsed", M = i.useMemo(
      () => ({
        state: y,
        open: x,
        setOpen: v,
        isMobile: l,
        openMobile: u,
        setOpenMobile: f,
        toggleSidebar: w
      }),
      [y, x, v, l, u, f, w]
    );
    return /* @__PURE__ */ r.jsx(j.Provider, { value: M, children: /* @__PURE__ */ r.jsx(H, { delayDuration: 0, children: /* @__PURE__ */ r.jsx(
      "div",
      {
        style: {
          "--sidebar-width": $,
          "--sidebar-width-icon": W,
          ...n
        },
        className: s(
          "group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar",
          o
        ),
        ref: g,
        ...c,
        children: d
      }
    ) }) });
  }
);
X.displayName = "SidebarProvider";
const Y = i.forwardRef(
  ({
    side: a = "left",
    variant: t = "sidebar",
    collapsible: e = "offcanvas",
    className: o,
    children: n,
    ...d
  }, c) => {
    const { isMobile: g, state: l, openMobile: u, setOpenMobile: f } = S(), m = e === "offcanvas" ? "icon" : e;
    return e === "none" ? /* @__PURE__ */ r.jsx(
      "div",
      {
        className: s(
          "flex h-full w-[--sidebar-width] flex-col border-r border-border-subtle bg-surface-card text-text-primary",
          o
        ),
        ref: c,
        ...d,
        children: n
      }
    ) : g ? /* @__PURE__ */ r.jsx(z, { open: u, onOpenChange: f, ...d, children: /* @__PURE__ */ r.jsxs(
      T,
      {
        "data-sidebar": "sidebar",
        "data-mobile": "true",
        className: s(
          "w-[--sidebar-width] border-r border-border-subtle bg-surface-card p-0 text-text-primary shadow-none [&>button]:hidden",
          o
        ),
        style: {
          "--sidebar-width": V
        },
        side: a,
        children: [
          /* @__PURE__ */ r.jsxs(B, { className: "sr-only", children: [
            /* @__PURE__ */ r.jsx(O, { children: "Sidebar" }),
            /* @__PURE__ */ r.jsx(A, { children: "Displays the mobile sidebar." })
          ] }),
          /* @__PURE__ */ r.jsx("div", { className: "flex h-full w-full flex-col", children: n })
        ]
      }
    ) }) : /* @__PURE__ */ r.jsxs(
      "div",
      {
        ref: c,
        className: "group peer hidden text-text-primary lg:block",
        "data-state": l,
        "data-collapsible": l === "collapsed" ? m : "",
        "data-variant": t,
        "data-side": a,
        children: [
          /* @__PURE__ */ r.jsx(
            "div",
            {
              className: s(
                "relative w-[--sidebar-width] bg-transparent transition-[width] duration-200 ease-linear",
                "group-data-[collapsible=offcanvas]:w-0",
                "group-data-[side=right]:rotate-180",
                t === "floating" ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]" : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]"
              )
            }
          ),
          /* @__PURE__ */ r.jsx(
            "div",
            {
              className: s(
                "fixed inset-y-0 z-20 hidden h-svh w-[--sidebar-width] transition-[left,right,width] duration-200 ease-linear lg:flex",
                a === "left" ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]" : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
                // Adjust the padding for floating and inset variants.
                t === "floating" ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]" : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=left]:border-border-subtle group-data-[side=right]:border-l group-data-[side=right]:border-border-subtle",
                o
              ),
              ...d,
              children: /* @__PURE__ */ r.jsx(
                "div",
                {
                  "data-sidebar": "sidebar",
                  className: "flex h-full w-full flex-col bg-surface-card text-text-primary group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-border-subtle group-data-[variant=floating]:shadow",
                  children: n
                }
              )
            }
          )
        ]
      }
    );
  }
);
Y.displayName = "Sidebar";
const J = i.forwardRef(({ className: a, onClick: t, ...e }, o) => {
  const { isMobile: n, open: d, openMobile: c, toggleSidebar: g } = S(), l = n ? c : d;
  return /* @__PURE__ */ r.jsxs(
    I,
    {
      ref: o,
      "data-sidebar": "trigger",
      variant: "ghost",
      size: "icon",
      "data-state": l ? "open" : "closed",
      className: s(
        "h-9 w-9 rounded-lg border border-border-subtle bg-surface-card text-text-primary hover:bg-surface-sunken hover:text-text-primary",
        a
      ),
      onClick: (u) => {
        t?.(u), g();
      },
      ...e,
      children: [
        /* @__PURE__ */ r.jsx(C, { className: "size-4" }),
        /* @__PURE__ */ r.jsx("span", { className: "sr-only", children: "Toggle Sidebar" })
      ]
    }
  );
});
J.displayName = "SidebarTrigger";
const Q = i.forwardRef(({ className: a, ...t }, e) => {
  const { toggleSidebar: o } = S();
  return /* @__PURE__ */ r.jsx(
    "button",
    {
      ref: e,
      "data-sidebar": "rail",
      "aria-label": "Toggle Sidebar",
      tabIndex: -1,
      onClick: o,
      title: "Toggle Sidebar",
      className: s(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        a
      ),
      ...t
    }
  );
});
Q.displayName = "SidebarRail";
const Z = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "main",
  {
    ref: e,
    className: s(
      "relative flex w-full flex-1 flex-col bg-background",
      "lg:peer-data-[variant=inset]:m-2 lg:peer-data-[variant=inset]:ml-0 lg:peer-data-[variant=inset]:rounded-xl lg:peer-data-[variant=inset]:shadow",
      a
    ),
    ...t
  }
));
Z.displayName = "SidebarInset";
const ee = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  _,
  {
    ref: e,
    "data-sidebar": "input",
    className: s(
      "h-10 w-full rounded-lg border-border-subtle bg-surface-card text-text-primary placeholder:text-text-muted shadow-none focus-visible:ring-2 focus-visible:ring-accent",
      a
    ),
    ...t
  }
));
ee.displayName = "SidebarInput";
const ae = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "div",
  {
    ref: e,
    "data-sidebar": "header",
    className: s(
      "flex flex-col gap-4 px-5 py-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-4 group-data-[collapsible=icon]:py-4",
      a
    ),
    ...t
  }
));
ae.displayName = "SidebarHeader";
const te = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "div",
  {
    ref: e,
    "data-sidebar": "footer",
    className: s(
      "flex flex-col gap-3 px-5 py-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-4 group-data-[collapsible=icon]:py-4",
      a
    ),
    ...t
  }
));
te.displayName = "SidebarFooter";
const re = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  E,
  {
    ref: e,
    "data-sidebar": "separator",
    className: s("mx-0 w-full bg-border-subtle", a),
    ...t
  }
));
re.displayName = "SidebarSeparator";
const ie = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "div",
  {
    ref: e,
    "data-sidebar": "content",
    className: s(
      "flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
      a
    ),
    ...t
  }
));
ie.displayName = "SidebarContent";
const oe = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "div",
  {
    ref: e,
    "data-sidebar": "group",
    className: s(
      "relative flex w-full min-w-0 flex-col gap-2 px-5 py-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-4",
      a
    ),
    ...t
  }
));
oe.displayName = "SidebarGroup";
const se = i.forwardRef(({ className: a, asChild: t = !1, ...e }, o) => {
  const n = t ? h : "div";
  return /* @__PURE__ */ r.jsx(
    n,
    {
      ref: o,
      "data-sidebar": "group-label",
      className: s(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium uppercase tracking-wide text-text-muted outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        a
      ),
      ...e
    }
  );
});
se.displayName = "SidebarGroupLabel";
const ne = i.forwardRef(({ className: a, asChild: t = !1, ...e }, o) => {
  const n = t ? h : "button";
  return /* @__PURE__ */ r.jsx(
    n,
    {
      ref: o,
      "data-sidebar": "group-action",
      className: s(
        "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:lg:hidden",
        "group-data-[collapsible=icon]:hidden",
        a
      ),
      ...e
    }
  );
});
ne.displayName = "SidebarGroupAction";
const de = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "div",
  {
    ref: e,
    "data-sidebar": "group-content",
    className: s("w-full text-sm", a),
    ...t
  }
));
de.displayName = "SidebarGroupContent";
const le = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "ul",
  {
    ref: e,
    "data-sidebar": "menu",
    className: s("flex w-full min-w-0 flex-col gap-2", a),
    ...t
  }
));
le.displayName = "SidebarMenu";
const ce = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "li",
  {
    ref: e,
    "data-sidebar": "menu-item",
    className: s("group/menu-item relative", a),
    ...t
  }
));
ce.displayName = "SidebarMenuItem";
const be = R(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-[4px] border border-transparent bg-surface-card p-2 text-left text-sm font-normal text-text-tertiary outline-none ring-sidebar-ring transition-[background-color,border-color,color,width,height,padding] hover:border-surface-hover hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent active:border-surface-hover active:bg-surface-sunken active:text-text-primary disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:border-surface-hover data-[active=true]:bg-surface-sunken data-[active=true]:font-medium data-[active=true]:text-text-primary data-[state=open]:border-surface-hover data-[state=open]:bg-surface-sunken data-[state=open]:text-text-primary group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:[&>span:last-child]:hidden [&>span:last-child]:truncate [&>svg]:size-5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "",
        outline: "border-border-subtle text-text-primary hover:border-border-subtle hover:bg-surface-sunken"
      },
      size: {
        default: "h-10 text-sm",
        sm: "h-9 text-xs",
        lg: "h-11 text-sm"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
), ue = i.forwardRef(
  ({
    asChild: a = !1,
    isActive: t = !1,
    variant: e = "default",
    size: o = "default",
    tooltip: n,
    className: d,
    ...c
  }, g) => {
    const l = a ? h : "button", { isMobile: u, state: f } = S(), m = /* @__PURE__ */ r.jsx(
      l,
      {
        ref: g,
        "data-sidebar": "menu-button",
        "data-size": o,
        "data-active": t,
        className: s(be({ variant: e, size: o }), d),
        ...c
      }
    );
    return n ? (typeof n == "string" && (n = {
      children: n
    }), /* @__PURE__ */ r.jsxs(D, { children: [
      /* @__PURE__ */ r.jsx(L, { asChild: !0, children: m }),
      /* @__PURE__ */ r.jsx(
        G,
        {
          side: "right",
          align: "center",
          hidden: f !== "collapsed" || u,
          ...n
        }
      )
    ] })) : m;
  }
);
ue.displayName = "SidebarMenuButton";
const fe = i.forwardRef(({ className: a, asChild: t = !1, showOnHover: e = !1, ...o }, n) => {
  const d = t ? h : "button";
  return /* @__PURE__ */ r.jsx(
    d,
    {
      ref: n,
      "data-sidebar": "menu-action",
      className: s(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:lg:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        e && "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground lg:opacity-0",
        a
      ),
      ...o
    }
  );
});
fe.displayName = "SidebarMenuAction";
const pe = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "div",
  {
    ref: e,
    "data-sidebar": "menu-badge",
    className: s(
      "pointer-events-none absolute right-1 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground",
      "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
      "peer-data-[size=sm]/menu-button:top-1",
      "peer-data-[size=default]/menu-button:top-1.5",
      "peer-data-[size=lg]/menu-button:top-2.5",
      "group-data-[collapsible=icon]:hidden",
      a
    ),
    ...t
  }
));
pe.displayName = "SidebarMenuBadge";
const ge = i.forwardRef(({ className: a, showIcon: t = !1, ...e }, o) => {
  const n = i.useMemo(() => `${Math.floor(Math.random() * 40) + 50}%`, []);
  return /* @__PURE__ */ r.jsxs(
    "div",
    {
      ref: o,
      "data-sidebar": "menu-skeleton",
      className: s("flex h-8 items-center gap-2 rounded-md px-2", a),
      ...e,
      children: [
        t && /* @__PURE__ */ r.jsx(
          N,
          {
            className: "size-4 rounded-md",
            "data-sidebar": "menu-skeleton-icon"
          }
        ),
        /* @__PURE__ */ r.jsx(
          N,
          {
            className: "h-4 max-w-[--skeleton-width] flex-1",
            "data-sidebar": "menu-skeleton-text",
            style: {
              "--skeleton-width": n
            }
          }
        )
      ]
    }
  );
});
ge.displayName = "SidebarMenuSkeleton";
const me = i.forwardRef(({ className: a, ...t }, e) => /* @__PURE__ */ r.jsx(
  "ul",
  {
    ref: e,
    "data-sidebar": "menu-sub",
    className: s(
      "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
      "group-data-[collapsible=icon]:hidden",
      a
    ),
    ...t
  }
));
me.displayName = "SidebarMenuSub";
const xe = i.forwardRef(({ ...a }, t) => /* @__PURE__ */ r.jsx("li", { ref: t, ...a }));
xe.displayName = "SidebarMenuSubItem";
const he = i.forwardRef(({ asChild: a = !1, size: t = "md", isActive: e, className: o, ...n }, d) => {
  const c = a ? h : "a";
  return /* @__PURE__ */ r.jsx(
    c,
    {
      ref: d,
      "data-sidebar": "menu-sub-button",
      "data-size": t,
      "data-active": e,
      className: s(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        t === "sm" && "text-xs",
        t === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        o
      ),
      ...n
    }
  );
});
he.displayName = "SidebarMenuSubButton";
export {
  Y as Sidebar,
  ie as SidebarContent,
  te as SidebarFooter,
  oe as SidebarGroup,
  ne as SidebarGroupAction,
  de as SidebarGroupContent,
  se as SidebarGroupLabel,
  ae as SidebarHeader,
  ee as SidebarInput,
  Z as SidebarInset,
  le as SidebarMenu,
  fe as SidebarMenuAction,
  pe as SidebarMenuBadge,
  ue as SidebarMenuButton,
  ce as SidebarMenuItem,
  ge as SidebarMenuSkeleton,
  me as SidebarMenuSub,
  he as SidebarMenuSubButton,
  xe as SidebarMenuSubItem,
  X as SidebarProvider,
  Q as SidebarRail,
  re as SidebarSeparator,
  J as SidebarTrigger,
  S as useSidebar
};
//# sourceMappingURL=index.es50.js.map
