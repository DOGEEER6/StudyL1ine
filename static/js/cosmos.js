/* Static sky: stars + fallback planet rim. Nothing in the sky animates in JS;
   only the looping video moves it. */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stars = document.getElementById("stars");
  const stage = document.getElementById("planet-stage");
  const video = document.getElementById("planet-video");
  const fallback = document.getElementById("planet-fallback");

  function setScale() {
    const portrait = window.innerHeight > window.innerWidth;
    const mobile = window.matchMedia("(max-width: 900px)").matches || portrait;
    if (mobile) {
      root.style.setProperty("--s", "1");
      return mobile;
    }
    const s = Math.min(window.innerWidth / 1672, window.innerHeight / 941, 1.35);
    root.style.setProperty("--s", s.toFixed(4));
    return false;
  }

  function sizeCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function drawStars() {
    if (!stars) return;
    const { ctx, w, h } = sizeCanvas(stars);
    ctx.clearRect(0, 0, w, h);
    // Deterministic pseudo-random field, drawn once per resize.
    let seed = 20261024;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const count = Math.round(Math.min(240, Math.max(90, (w * h) / 9000)));
    for (let i = 0; i < count; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = rnd() * 1.35 + 0.25;
      const alpha = rnd() * 0.7 + 0.12;
      ctx.beginPath();
      ctx.fillStyle =
        rnd() > 0.9 ? `rgba(196, 160, 255, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few brighter foreground stars.
    for (let i = 0; i < 8; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h * 0.7;
      const r = rnd() * 1.6 + 1.1;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      glow.addColorStop(0, "rgba(255,255,255,.9)");
      glow.addColorStop(0.25, "rgba(190,140,255,.35)");
      glow.addColorStop(1, "rgba(147,18,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlanet() {
    if (!fallback) return;
    const { ctx, w, h } = sizeCanvas(fallback);
    ctx.clearRect(0, 0, w, h);
    if (!w || !h) return;
    const cx = w * 0.5;
    const cy = -h * 1.14;
    const radius = Math.max(w * 0.72, h * 1.35);
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "#5b18c9");
    gradient.addColorStop(0.28, "#9312ff");
    gradient.addColorStop(0.52, "#e08cff");
    gradient.addColorStop(0.74, "#a020ff");
    gradient.addColorStop(1, "#4a0d9e");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [line, alpha, blur] of [
      [28, 0.12, 70],
      [12, 0.2, 44],
      [4, 0.5, 24],
      [1.4, 0.95, 8],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.lineWidth = line;
      ctx.strokeStyle = gradient;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "#a020ff";
      ctx.shadowBlur = blur;
      ctx.stroke();
    }
    // A thin magenta inner rim.
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 18, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255, 135, 255, .65)";
    ctx.globalAlpha = 0.6;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.restore();
  }

  let mobile = false;
  function applyMode() {
    mobile = setScale();
    if (!video) return;
    if (mobile || reduced.matches) {
      video.pause();
      video.style.display = "none";
      stage?.classList.remove("video-ready");
      if (fallback) fallback.style.opacity = "1";
    } else {
      video.style.display = "";
      if (video.readyState >= 2) stage?.classList.add("video-ready");
      const play = video.play();
      if (play && typeof play.then === "function") {
        play.then(() => stage?.classList.add("video-ready")).catch(() => {});
      }
    }
  }

  function resize() {
    drawStars();
    drawPlanet();
    applyMode();
  }

  if (video) {
    const markReady = () => {
      if (mobile || reduced.matches) return;
      stage?.classList.add("video-ready");
    };
    ["loadeddata", "canplay", "canplaythrough", "playing"].forEach((eventName) => {
      video.addEventListener(eventName, markReady);
    });
    video.addEventListener("error", () => {
      stage?.classList.remove("video-ready");
    });
  }
  if (reduced.addEventListener) reduced.addEventListener("change", applyMode);

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!video || mobile || reduced.matches) return;
    if (document.hidden) video.pause();
    else {
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    }
  });

  resize();
})();
