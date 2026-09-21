import { __exports as e } from "./index.es69.js";
var s;
function a() {
  if (s) return e;
  s = 1;
  var i = /* @__PURE__ */ Symbol.for("react.transitional.element"), _ = /* @__PURE__ */ Symbol.for("react.fragment");
  function o(l, r, t) {
    var u = null;
    if (t !== void 0 && (u = "" + t), r.key !== void 0 && (u = "" + r.key), "key" in r) {
      t = {};
      for (var n in r)
        n !== "key" && (t[n] = r[n]);
    } else t = r;
    return r = t.ref, {
      $$typeof: i,
      type: l,
      key: u,
      ref: r !== void 0 ? r : null,
      props: t
    };
  }
  return e.Fragment = _, e.jsx = o, e.jsxs = o, e;
}
export {
  a as __require
};
//# sourceMappingURL=index.es67.js.map
