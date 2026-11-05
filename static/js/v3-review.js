/* 复习页（/review）：独立的页面式复习，不再用弹窗。
   队列来自 /api/entries?due=1，评分写回 /api/entries/<id>/review。 */
(function () {
  "use strict";

  var V3 = window.V3 || {};
  var root = document.getElementById("rv-root");
  var card = document.getElementById("rv-card");
  var sub = document.getElementById("rv-sub");
  var progressEl = document.getElementById("rv-progress");

  var RESULTS = [
    { key: "again", label: "忘了", note: "完全想不起来" },
    { key: "hard", label: "勉强", note: "想得吃力" },
    { key: "good", label: "会了", note: "正常答出" },
    { key: "easy", label: "很熟", note: "一眼就会" }
  ];
  var RESULT_LABEL = { again: "忘了", hard: "勉强", good: "会了", easy: "很熟" };
  var STATUS_LABEL = { unsolved: "不会", wrong: "错题", reviewing: "待复习", mastered: "已掌握" };

  var state = {
    queue: [],
    index: 0,
    entry: null,
    revealed: false,
    result: null,
    note: "",
    reviewed: 0,
    total: 0,
    graded: null,
    busy: false
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function subjectName(id) {
    if (V3.subjectName) return V3.subjectName(id);
    var subjects = (V3.subjects || []).filter(function (s) { return s.id === id; });
    return subjects.length ? subjects[0].name : id;
  }

  function math(node) {
    if (V3.math) V3.math(node);
  }

  function toast(message, tone) {
    if (V3.toast) V3.toast(message, tone || "info");
    else if (window.console) console.log(message);
  }

  function fail(err) {
    toast((err && err.message) || "出错了", "error");
  }

  function setSub(text) {
    if (sub) sub.textContent = text;
  }

  function renderProgress() {
    if (!progressEl) return;
    progressEl.textContent = state.total ? (state.index + 1) + " / " + state.total : "";
  }

  // ---------- 载入 ----------

  async function loadQueue() {
    var single = new URLSearchParams(location.search).get("entry");
    try {
      if (single) {
        var one = await V3.api("/api/entries/" + encodeURIComponent(single));
        state.queue = [one];
        setSub("单题复习");
      } else {
        var data = await V3.api("/api/entries?due=1&solutions=0&sort=due&limit=100");
        state.queue = data.entries || [];
        setSub(state.queue.length
          ? "按遗忘曲线排好的顺序，先自己回忆，再看答案。"
          : "今天没有到期的题目，可以主动挑一道来复习。");
      }
    } catch (err) {
      state.queue = [];
      setSub("题目没取到：" + ((err && err.message) || "请刷新重试"));
    }
    state.total = state.queue.length;
    state.index = 0;
    state.entry = state.queue[0] || null;
    render();
  }

  async function ensureDetail() {
    if (!state.entry) return;
    if (state.entry.solution !== undefined && state.entry.answer !== undefined) return;
    var id = state.entry.id;
    var full = await V3.api("/api/entries/" + id);
    state.entry = full;
    var idx = state.queue.findIndex(function (item) { return item.id === id; });
    if (idx >= 0) state.queue[idx] = full;
  }

  // ---------- 渲染 ----------

  function render() {
    clear(card);
    card.classList.add("rv-card");
    renderProgress();

    if (!state.entry) {
      card.appendChild(el("div", { class: "rv-done" }, [
        el("div", { class: "mark", text: "✓" }),
        el("h3", { text: state.reviewed > 0 ? "本轮复习完成" : "今天没有到期的题目" }),
        el("p", {
          text: state.reviewed > 0
            ? "完成了 " + state.reviewed + " 道题，下次复习时间已经按你的评分排好。"
            : "可以回到错题本挑一道题来复习，或者继续记录新题。"
        }),
        el("div", { class: "rv-done-actions" }, [
          el("a", { class: "v3-btn primary", href: "/", text: "回到错题本" }),
          el("a", { class: "v3-btn", href: "/learning", text: "看学习状况" })
        ])
      ]));
      return;
    }

    var entry = state.entry;

    // 头部
    var head = el("div", { class: "rv-head" }, [
      el("div", null, [
        el("div", { class: "rv-kicker", text: "复习进度 · 第 " + (state.index + 1) + " 道 / 共 " + state.total + " 道" }),
        el("h2", { class: "rv-name", text: entry.title || "未命名题目" }),
        el("div", { class: "rv-chips" }, [
          el("span", { class: "rv-chip", text: subjectName(entry.subject) }),
          el("span", {
            class: "rv-chip" + (entry.status === "wrong" ? " bad" : entry.status === "unsolved" ? " warn" : ""),
            text: STATUS_LABEL[entry.status] || entry.status || "未分类"
          }),
          entry.chapter ? el("span", { class: "rv-chip", text: entry.chapter }) : null
        ])
      ]),
      el("a", { class: "v3-btn small", href: "/?entry=" + entry.id, text: "看原题" })
    ]);
    card.appendChild(head);

    // 题目
    var question = el("div", { class: "rv-question", text: entry.problem || entry.ocr_text || "（这道题没有正文）" });
    card.appendChild(question);
    math(question);

    // 题面已经有文字就不重复贴题目截图，免得一屏两个一样的题干
    var hasProblemText = (entry.problem || "").trim().length > 20;
    (entry.attachments || []).forEach(function (item) {
      if ((item.kind || "problem") === "solution") return;   // 解答图留到揭晓后
      if (hasProblemText && (item.kind || "problem") === "problem") return;
      var src = item.url || item.thumb;
      if (!src) return;
      card.appendChild(el("figure", { class: "rv-figure" }, [
        el("img", { src: src, alt: "题目图片", loading: "lazy" })
      ]));
    });

    // 揭晓前：先上传解答批阅
    if (!state.revealed) {
      var upload = el("label", { class: "v3-btn rv-upload", for: "rv-file" }, [
        document.createTextNode("📷 先上传我的解答，AI 批阅")
      ]);
      var file = el("input", { type: "file", id: "rv-file", accept: "image/*" });
      file.addEventListener("change", function () {
        if (file.files && file.files[0]) gradePhoto(file.files[0], upload);
      });
      upload.appendChild(file);
      card.appendChild(upload);
      card.appendChild(el("div", {
        class: "rv-hint",
        text: "把纸上的解题过程拍下来，AI 会指出错在第几步；看完批阅再对照标准解析。"
      }));

      if (state.graded) card.appendChild(renderGrade(state.graded));

      card.appendChild(el("div", { class: "rv-foot" }, [
        el("button", {
          class: "v3-btn primary", type: "button",
          onclick: function () { reveal(); },
          text: "看答案与解析"
        }),
        el("div", { class: "spacer" }),
        el("button", {
          class: "v3-btn", type: "button", onclick: function () { move(-1); },
          disabled: state.index === 0 ? "disabled" : null, text: "← 上一道"
        }),
        el("button", {
          class: "v3-btn", type: "button", onclick: function () { move(1); },
          disabled: state.index >= state.total - 1 ? "disabled" : null, text: "下一道 →"
        })
      ]));
      return;
    }

    // 揭晓后：答案 + 解析 + 评分
    var answerText = entry.answer || entry.manual_answer || entry.ai_answer || "";
    var solutionText = entry.solution || entry.manual_solution || entry.ai_solution || "";
    if (answerText) {
      var ans = el("div", { class: "rv-answer" }, [
        el("h4", { text: "答案" }),
        el("div", { class: "rv-body", text: answerText })
      ]);
      card.appendChild(ans);
      math(ans);
    }
    if (solutionText) {
      var sol = el("div", { class: "rv-answer" }, [
        el("h4", { text: "解析" }),
        el("div", { class: "rv-body", text: solutionText })
      ]);
      card.appendChild(sol);
      math(sol);
    }
    (entry.attachments || []).forEach(function (item) {
      if ((item.kind || "problem") !== "solution") return;
      var src = item.url || item.thumb;
      if (!src) return;
      card.appendChild(el("figure", { class: "rv-figure" }, [
        el("img", { src: src, alt: "解答图片", loading: "lazy" })
      ]));
    });
    if (!answerText && !solutionText) {
      card.appendChild(el("div", { class: "rv-answer" }, [
        el("h4", { text: "还没有解析" }),
        el("div", { class: "rv-body", text: "这道题当初没有写解答，可以在原题里补上。" })
      ]));
    }

    if (state.graded) card.appendChild(renderGrade(state.graded));

    var results = el("div", { class: "rv-results" });
    RESULTS.forEach(function (item) {
      results.appendChild(el("button", {
        class: "rv-result" + (state.result === item.key ? " active" : ""),
        type: "button",
        onclick: function () { state.result = item.key; render(); }
      }, [
        el("strong", { text: item.label }),
        el("small", { text: item.note })
      ]));
    });
    card.appendChild(results);

    var note = el("textarea", { class: "rv-note", rows: "2", placeholder: "备注（可选）：这次卡在哪一步？" });
    note.value = state.note || "";
    note.addEventListener("input", function () { state.note = note.value; });
    card.appendChild(note);

    card.appendChild(el("div", { class: "rv-foot" }, [
      el("button", {
        class: "v3-btn primary", type: "button",
        onclick: function () { submit(); },
        disabled: state.result && !state.busy ? null : "disabled",
        text: state.result ? "提交并继续" : "先选一个掌握程度"
      }),
      el("button", { class: "v3-btn", type: "button", onclick: function () { state.revealed = false; render(); }, text: "回到题目" }),
      el("div", { class: "spacer" }),
      el("button", {
        class: "v3-btn", type: "button", onclick: function () { move(-1); },
        disabled: state.index === 0 ? "disabled" : null, text: "← 上一道"
      }),
      el("button", {
        class: "v3-btn", type: "button", onclick: function () { move(1); },
        disabled: state.index >= state.total - 1 ? "disabled" : null, text: "下一道 →"
      })
    ]));
  }

  function renderGrade(grade) {
    var box = el("div", { class: "rv-grade" });
    var score = grade.score === undefined || grade.score === null ? "—" : grade.score;
    box.appendChild(el("div", { class: "rv-grade-score" }, [
      document.createTextNode(String(score)),
      el("small", { text: "分 · " + (grade.verdict || "AI 批阅") })
    ]));
    if (grade.error_step) {
      box.appendChild(el("div", { class: "rv-grade-row" }, [el("b", { text: "错在" }), document.createTextNode(grade.error_step)]));
    }
    if (grade.error_type) {
      box.appendChild(el("div", { class: "rv-grade-row" }, [el("b", { text: "错因" }), document.createTextNode(grade.error_type)]));
    }
    if (grade.detail) {
      box.appendChild(el("div", { class: "rv-grade-row" }, [el("b", { text: "批注" }), document.createTextNode(grade.detail)]));
    }
    if (grade.correct_solution) {
      var s = el("div", { class: "rv-grade-row" }, [el("b", { text: "正确做法" }), document.createTextNode(grade.correct_solution)]);
      box.appendChild(s);
      math(s);
    }
    return box;
  }

  // ---------- 行为 ----------

  async function reveal() {
    try {
      await ensureDetail();
    } catch (err) {
      fail(err);
      return;
    }
    state.revealed = true;
    render();
  }

  function move(delta) {
    var next = state.index + delta;
    if (next < 0 || next >= state.total) return;
    state.index = next;
    state.entry = state.queue[next] || null;
    state.revealed = false;
    state.result = null;
    state.note = "";
    state.graded = null;
    render();
  }

  async function submit() {
    if (!state.entry || !state.result || state.busy) return;
    state.busy = true;
    render();
    try {
      var data = await V3.api("/api/entries/" + state.entry.id + "/review", {
        method: "POST",
        body: { result: state.result, note: state.note || "" }
      });
      var idx = state.queue.findIndex(function (item) { return item.id === state.entry.id; });
      if (idx >= 0) state.queue[idx] = data.entry || state.entry;
      state.reviewed += 1;
      toast("已记录：" + (RESULT_LABEL[state.result] || "") + "，" + data.interval_days + " 天后再见", "success");
      state.index += 1;
      state.entry = state.queue[state.index] || null;
      state.revealed = false;
      state.result = null;
      state.note = "";
      state.graded = null;
    } catch (err) {
      fail(err);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function gradePhoto(file, label) {
    if (state.busy) return;
    state.busy = true;
    label.classList.add("is-busy");
    var started = Date.now();
    var bar = el("div", { class: "rv-progressbar" }, [el("i", { style: "width:6%" })]);
    var barLabel = el("div", { class: "rv-progressbar-label", text: "正在压缩图片…" });
    var holder = el("div", null, [bar, barLabel]);
    var uploadBox = label.parentElement;
    uploadBox.insertBefore(holder, label.nextSibling);
    var timer = setInterval(function () {
      var fill = bar.firstChild;
      var width = parseFloat(fill.style.width) || 6;
      fill.style.width = Math.min(92, width + Math.max(0.6, (92 - width) * 0.06)) + "%";
      if (!barLabel.dataset.stage && Date.now() - started > 1200) {
        barLabel.dataset.stage = "1";
        barLabel.textContent = "AI 正在看你写的每一步…";
      }
    }, 220);
    try {
      var dataUrl = await compress(file);
      var res = await V3.api("/api/v3/grade", {
        method: "POST",
        body: { entry_id: state.entry.id, image: dataUrl }
      });
      clearInterval(timer);
      bar.firstChild.style.width = "100%";
      barLabel.textContent = "批阅完成";
      state.graded = res.grade || null;
      setTimeout(render, 400);
    } catch (err) {
      clearInterval(timer);
      barLabel.textContent = (err && err.message) || "批阅失败";
      fail(err);
    } finally {
      state.busy = false;
      label.classList.remove("is-busy");
    }
  }

  function compress(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("读不出这张图")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("图片解析失败")); };
        img.onload = function () {
          var maxSide = 1500;
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- 启动 ----------

  async function boot() {
    if (!root || !card) return;
    if (V3.boot) {
      try { await V3.boot(); } catch (err) { /* 顶栏信息拿不到也能用 */ }
    }
    loadQueue();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
