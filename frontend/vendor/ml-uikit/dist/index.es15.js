import { j as s } from "./index.es62.js";
import * as e from "react";
import R from "embla-carousel-react";
import { ArrowLeft as S, ArrowRight as k } from "lucide-react";
import { cn as m } from "./index.es63.js";
import { Button as N } from "./index.es10.js";
const p = e.createContext(null);
function x() {
  const o = e.useContext(p);
  if (!o)
    throw new Error("useCarousel must be used within a <Carousel />");
  return o;
}
const z = e.forwardRef(
  ({
    orientation: o = "horizontal",
    opts: l,
    setApi: t,
    plugins: a,
    className: c,
    children: i,
    ...u
  }, f) => {
    const [w, r] = R(
      {
        ...l,
        axis: o === "horizontal" ? "x" : "y"
      },
      a
    ), [v, y] = e.useState(!1), [j, b] = e.useState(!1), d = e.useCallback((n) => {
      n && (y(n.canScrollPrev()), b(n.canScrollNext()));
    }, []), C = e.useCallback(() => {
      r?.scrollPrev();
    }, [r]), h = e.useCallback(() => {
      r?.scrollNext();
    }, [r]), P = e.useCallback(
      (n) => {
        n.key === "ArrowLeft" ? (n.preventDefault(), C()) : n.key === "ArrowRight" && (n.preventDefault(), h());
      },
      [C, h]
    );
    return e.useEffect(() => {
      !r || !t || t(r);
    }, [r, t]), e.useEffect(() => {
      if (r)
        return d(r), r.on("reInit", d), r.on("select", d), () => {
          r?.off("select", d);
        };
    }, [r, d]), /* @__PURE__ */ s.jsx(
      p.Provider,
      {
        value: {
          carouselRef: w,
          api: r,
          opts: l,
          orientation: o || (l?.axis === "y" ? "vertical" : "horizontal"),
          scrollPrev: C,
          scrollNext: h,
          canScrollPrev: v,
          canScrollNext: j
        },
        children: /* @__PURE__ */ s.jsx(
          "div",
          {
            ref: f,
            onKeyDownCapture: P,
            className: m("relative", c),
            role: "region",
            "aria-roledescription": "carousel",
            ...u,
            children: i
          }
        )
      }
    );
  }
);
z.displayName = "Carousel";
const g = e.forwardRef(({ className: o, ...l }, t) => {
  const { carouselRef: a, orientation: c } = x();
  return /* @__PURE__ */ s.jsx("div", { ref: a, className: "overflow-hidden", children: /* @__PURE__ */ s.jsx(
    "div",
    {
      ref: t,
      className: m(
        "flex",
        c === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
        o
      ),
      ...l
    }
  ) });
});
g.displayName = "CarouselContent";
const E = e.forwardRef(({ className: o, ...l }, t) => {
  const { orientation: a } = x();
  return /* @__PURE__ */ s.jsx(
    "div",
    {
      ref: t,
      role: "group",
      "aria-roledescription": "slide",
      className: m(
        "min-w-0 shrink-0 grow-0 basis-full",
        a === "horizontal" ? "pl-4" : "pt-4",
        o
      ),
      ...l
    }
  );
});
E.displayName = "CarouselItem";
const D = e.forwardRef(({ className: o, variant: l = "outline", size: t = "icon", ...a }, c) => {
  const { orientation: i, scrollPrev: u, canScrollPrev: f } = x();
  return /* @__PURE__ */ s.jsxs(
    N,
    {
      ref: c,
      variant: l,
      size: t,
      className: m(
        "absolute  h-8 w-8 rounded-full",
        i === "horizontal" ? "-left-12 top-1/2 -translate-y-1/2" : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        o
      ),
      disabled: !f,
      onClick: u,
      ...a,
      children: [
        /* @__PURE__ */ s.jsx(S, { className: "h-4 w-4" }),
        /* @__PURE__ */ s.jsx("span", { className: "sr-only", children: "Previous slide" })
      ]
    }
  );
});
D.displayName = "CarouselPrevious";
const I = e.forwardRef(({ className: o, variant: l = "outline", size: t = "icon", ...a }, c) => {
  const { orientation: i, scrollNext: u, canScrollNext: f } = x();
  return /* @__PURE__ */ s.jsxs(
    N,
    {
      ref: c,
      variant: l,
      size: t,
      className: m(
        "absolute h-8 w-8 rounded-full",
        i === "horizontal" ? "-right-12 top-1/2 -translate-y-1/2" : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        o
      ),
      disabled: !f,
      onClick: u,
      ...a,
      children: [
        /* @__PURE__ */ s.jsx(k, { className: "h-4 w-4" }),
        /* @__PURE__ */ s.jsx("span", { className: "sr-only", children: "Next slide" })
      ]
    }
  );
});
I.displayName = "CarouselNext";
export {
  z as Carousel,
  g as CarouselContent,
  E as CarouselItem,
  I as CarouselNext,
  D as CarouselPrevious
};
//# sourceMappingURL=index.es15.js.map
