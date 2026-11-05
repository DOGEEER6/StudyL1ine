/* Shared helpers for the 学线 v3 pages (exam / duel / code / explain). */
(function () {
  const V3 = (window.V3 = { csrf: "", user: null, subjects: [], kinds: {}, suggestions: {} });

  V3.esc = function (value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  V3.api = async function (path, options) {
    options = options || {};
    const opts = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body !== undefined) {
      opts.body = JSON.stringify(options.body);
      opts.headers["Content-Type"] = "application/json";
    }
    if (opts.method !== "GET" && V3.csrf) opts.headers["X-CSRF-Token"] = V3.csrf;
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (err) { /* keep empty */ }
    if (res.status === 401) { location.href = "/login"; throw new Error("登录已失效"); }
    if (!res.ok) throw new Error(data.error || "请求失败（" + res.status + "）");
    return data;
  };

  V3.boot = async function () {
    const me = await V3.api("/api/me");
    V3.csrf = me.csrf || "";
    V3.user = me.user || null;
    V3.subjects = me.subjects || [];
    V3.kinds = me.kinds || {};
    V3.suggestions = me.suggestions || {};
    return me;
  };

  V3.toast = function (message, kind) {
    const box = document.getElementById("v3-toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "v3-toast" + (kind === "error" ? " error" : "");
    el.textContent = message;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  };

  V3.fail = function (err) { V3.toast(err && err.message ? err.message : String(err), "error"); };

  V3.subjectName = function (id) {
    const hit = (V3.subjects || []).find(function (s) { return s.id === id; });
    return hit ? hit.name : id;
  };

  V3.kindOf = function (id) {
    const hit = (V3.subjects || []).find(function (s) { return s.id === id; });
    return hit ? hit.kind || "math" : "math";
  };

  V3.math = function (root) {
    if (!root || !window.renderMathInElement) return;
    try {
      renderMathInElement(root, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        throwOnError: false
      });
    } catch (err) { /* ignore */ }
  };

  V3.fmtTime = function (text) {
    if (!text) return "";
    const s = String(text).replace("T", " ");
    return s.slice(0, 16);
  };

  V3.weekday = function (day) {
    const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const d = new Date(day + "T00:00:00");
    return isNaN(d.getTime()) ? "" : names[d.getDay()];
  };
})();
