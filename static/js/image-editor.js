/* Local image editing. Coordinates always refer to the full oriented image. */
(function (root) {
  "use strict";
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function adjust(rect, bounds, action, dx, dy) {
    const min = Math.min(bounds.minCrop || 32, bounds.w, bounds.h);
    if (action === "move") return { ...rect, x: clamp(rect.x + dx, 0, bounds.w - rect.w), y: clamp(rect.y + dy, 0, bounds.h - rect.h) };
    let left = rect.x, top = rect.y, right = rect.x + rect.w, bottom = rect.y + rect.h;
    if (action.includes("w")) left = clamp(left + dx, 0, right - min);
    if (action.includes("e")) right = clamp(right + dx, left + min, bounds.w);
    if (action.includes("n")) top = clamp(top + dy, 0, bottom - min);
    if (action.includes("s")) bottom = clamp(bottom + dy, top + min, bounds.h);
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
  function rotateRect(rect, bounds, clockwise) {
    return clockwise
      ? { x: bounds.h - rect.y - rect.h, y: rect.x, w: rect.h, h: rect.w }
      : { x: rect.y, y: bounds.w - rect.x - rect.w, w: rect.h, h: rect.w };
  }
  function pixels(rect, bounds) {
    const x = clamp(Math.round(rect.x), 0, bounds.w - 1), y = clamp(Math.round(rect.y), 0, bounds.h - 1);
    return { x, y, w: clamp(Math.round(rect.x + rect.w) - x, 1, bounds.w - x), h: clamp(Math.round(rect.y + rect.h) - y, 1, bounds.h - y) };
  }
  const geometry = { adjust, rotateRect, pixels };
  if (typeof module !== "undefined" && module.exports) { module.exports = geometry; return; }

  let session = null;
  const $ = (id) => document.getElementById(id);
  const dialog = () => $("image-editor-dialog");
  const surface = () => $("crop-surface");
  const box = () => $("crop-box");
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function load(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("这张图片暂时无法编辑，请换成 JPG、PNG 或 WebP 后重试"));
      image.src = src;
    });
  }
  function fit() {
    if (!session || !dialog().open) return;
    const workspace = $("crop-workspace");
    const scale = Math.min((workspace.clientWidth - 32) / session.bounds.w, (workspace.clientHeight - 32) / session.bounds.h);
    session.bounds.minCrop = 40 / Math.max(scale, .001);
    surface().style.width = `${Math.max(1, session.bounds.w * scale)}px`;
    surface().style.height = `${Math.max(1, session.bounds.h * scale)}px`;
  }
  function paintSelection() {
    const { rect, bounds } = session;
    Object.assign(box().style, {
      left: `${rect.x / bounds.w * 100}%`, top: `${rect.y / bounds.h * 100}%`,
      width: `${rect.w / bounds.w * 100}%`, height: `${rect.h / bounds.h * 100}%`,
    });
    const crop = pixels(rect, bounds);
    $("crop-size").textContent = `${crop.w} × ${crop.h} 像素`;
  }
  function paintImage() {
    const { base, turns } = session;
    const target = $("crop-canvas");
    target.width = turns % 2 ? base.height : base.width;
    target.height = turns % 2 ? base.width : base.height;
    const ctx = target.getContext("2d");
    ctx.translate(target.width / 2, target.height / 2);
    ctx.rotate(turns * Math.PI / 2);
    ctx.drawImage(base, -base.width / 2, -base.height / 2);
    session.bounds = { w: target.width, h: target.height };
    fit(); paintSelection();
  }
  function rotate(clockwise) {
    if (!session || session.busy) return;
    session.rect = rotateRect(session.rect, session.bounds, clockwise);
    session.turns = (session.turns + (clockwise ? 1 : 3)) % 4;
    paintImage();
  }
  function reset() {
    if (!session || session.busy) return;
    session.turns = 0;
    session.rect = { x: 0, y: 0, w: session.base.width, h: session.base.height };
    paintImage();
  }
  function setBusy(busy) {
    if (session) session.busy = busy;
    dialog().querySelectorAll("button").forEach((button) => button.disabled = busy);
    box().inert = busy;
    $("crop-apply").textContent = busy ? "处理中…" : "应用修改";
  }
  function blobURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("图片读取失败，请重试"));
      reader.readAsDataURL(blob);
    });
  }
  async function apply() {
    if (!session || session.busy) return;
    const current = session;
    setBusy(true);
    try {
      const crop = pixels(current.rect, current.bounds);
      const output = canvas(crop.w, crop.h);
      output.getContext("2d").drawImage($("crop-canvas"), crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      const blob = await new Promise((resolve) => output.toBlob(resolve, "image/webp", .94));
      if (!blob) throw new Error("图片处理失败，请重试");
      const data = await blobURL(blob);
      if (session !== current || !dialog().open) return;
      current.result = {
        name: current.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".png"),
        data, previewUrl: URL.createObjectURL(blob), w: crop.w, h: crop.h, size: blob.size,
      };
      current.close(dialog());
    } catch (err) {
      if (session === current) {
        $("crop-error").textContent = err.message || "图片处理失败，请重试";
        $("crop-error").hidden = false;
      }
    } finally { if (session === current) setBusy(false); }
  }
  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    $("crop-left").addEventListener("click", () => rotate(false));
    $("crop-right").addEventListener("click", () => rotate(true));
    $("crop-reset").addEventListener("click", reset);
    $("crop-apply").addEventListener("click", apply);
    dialog().querySelectorAll("[data-crop-cancel]").forEach((button) => button.addEventListener("click", () => {
      if (session && !session.busy) session.close(dialog());
    }));
    dialog().addEventListener("cancel", (event) => { if (session?.busy) event.preventDefault(); });
    dialog().addEventListener("close", () => {
      if (!session) return;
      const current = session;
      session = null;
      $("crop-canvas").width = $("crop-canvas").height = 1;
      surface().style.width = surface().style.height = "";
      current.resolve(current.result || null);
    });
    new ResizeObserver(fit).observe($("crop-workspace"));
    box().addEventListener("pointerdown", (event) => {
      if (!session || session.busy || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      const action = event.target.closest("[data-crop-handle]")?.dataset.cropHandle || "move";
      session.drag = { id: event.pointerId, action, x: event.clientX, y: event.clientY, rect: { ...session.rect } };
      box().setPointerCapture(event.pointerId);
    });
    box().addEventListener("pointermove", (event) => {
      const drag = session?.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const area = surface().getBoundingClientRect();
      session.rect = adjust(drag.rect, session.bounds, drag.action,
        (event.clientX - drag.x) * session.bounds.w / area.width,
        (event.clientY - drag.y) * session.bounds.h / area.height);
      paintSelection();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) box().addEventListener(name, () => { if (session) session.drag = null; });
    box().addEventListener("keydown", (event) => {
      if (!session || session.busy || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const action = event.target.dataset.cropHandle || "move";
      const step = event.shiftKey ? 1 : Math.max(1, Math.round(Math.min(session.bounds.w, session.bounds.h) / 100));
      session.rect = adjust(session.rect, session.bounds, action,
        event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
      paintSelection();
    });
  }
  async function open({ src, name, show, close, isCurrent }) {
    if (session || (isCurrent && !isCurrent())) return null;
    const image = await load(src);
    if (session || (isCurrent && !isCurrent())) return null;
    bind();
    const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
    const base = canvas(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)));
    base.getContext("2d").drawImage(image, 0, 0, base.width, base.height);
    const result = new Promise((resolve) => {
      session = { base, turns: 0, bounds: { w: base.width, h: base.height }, rect: { x: 0, y: 0, w: base.width, h: base.height }, name: name || "题目图片", close, resolve, busy: false };
    });
    $("crop-error").hidden = true;
    setBusy(false);
    show(dialog());
    paintImage();
    return result;
  }
  root.MathImageEditor = { open };
})(typeof window !== "undefined" ? window : globalThis);
