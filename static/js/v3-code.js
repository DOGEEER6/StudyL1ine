/* v3-code.js — IDE 页面（洛谷式两栏）：左边题目、右边代码 + 自测输入输出。 */
(function () {
  var entryId = document.body.dataset.entryId || "";
  var currentEntry = entryId;
  var bankItems = [];
  var suppressAuto = false;
  var tests = [];
  var generating = false;
  var autoTimer = null;
  var $ = function (id) { return document.getElementById(id); };
  var INDENT = "    ";
  var TEST_CAP = 12;

  /* ---------------- 编辑器 ---------------- */
  function refreshGutter() {
    var code = $("code-source");
    var lines = code.value.split("\n").length;
    var nums = [];
    for (var i = 1; i <= lines; i += 1) nums.push(i);
    $("gutter").textContent = nums.join("\n");
    $("gutter").scrollTop = code.scrollTop;
  }

  function setSelection(start, end) {
    var el = $("code-source");
    el.selectionStart = start;
    el.selectionEnd = end === undefined ? start : end;
  }

  function replaceRange(start, end, text) {
    var el = $("code-source");
    var before = el.value.slice(0, start);
    var after = el.value.slice(end);
    el.value = before + text + after;
    setSelection(start + text.length);
    refreshGutter();
  }

  function indentSelection(outdent) {
    var el = $("code-source");
    var start = el.selectionStart;
    var end = el.selectionEnd;
    var value = el.value;
    var lineStart = value.lastIndexOf("\n", start - 1) + 1;
    var block = value.slice(lineStart, end);
    var lines = block.split("\n");
    var changed = lines.map(function (line) {
      if (outdent) {
        if (line.slice(0, INDENT.length) === INDENT) return line.slice(INDENT.length);
        return line.replace(/^\s{1,4}/, "");
      }
      return INDENT + line;
    });
    var text = changed.join("\n");
    el.value = value.slice(0, lineStart) + text + value.slice(end);
    var delta = text.length - block.length;
    setSelection(start + (outdent ? Math.max(-INDENT.length, delta) : INDENT.length), end + delta);
    refreshGutter();
  }

  function handleEditorKeys(event) {
    var el = event.target;
    if (event.key === "Tab") {
      event.preventDefault();
      var multi = el.value.slice(el.selectionStart, el.selectionEnd).indexOf("\n") !== -1;
      if (multi) {
        indentSelection(event.shiftKey);
        return;
      }
      if (event.shiftKey) {
        var s = el.selectionStart;
        var lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
        var before = el.value.slice(lineStart, s);
        var strip = before.match(/^\s{1,4}$/) ? before.length : Math.min(INDENT.length, before.length - before.replace(/^\s+/, "").length);
        if (strip > 0) replaceRange(s - strip, s, "");
        return;
      }
      if (document.execCommand && document.execCommand("insertText", false, INDENT)) {
        refreshGutter();
      } else {
        replaceRange(el.selectionStart, el.selectionEnd, INDENT);
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      var pos = el.selectionStart;
      var lineStart = el.value.lastIndexOf("\n", pos - 1) + 1;
      var line = el.value.slice(lineStart, pos);
      var indent = (line.match(/^[ \t]*/) || [""])[0];
      var opens = /[{([]\s*$/.test(line);
      var insert = "\n" + indent + (opens ? INDENT : "");
      event.preventDefault();
      if (document.execCommand && document.execCommand("insertText", false, insert)) {
        refreshGutter();
      } else {
        replaceRange(pos, el.selectionEnd, insert);
      }
      return;
    }
    if (event.key === "}" && el.selectionStart === el.selectionEnd) {
      var p = el.selectionStart;
      var start = el.value.lastIndexOf("\n", p - 1) + 1;
      var current = el.value.slice(start, p);
      if (current && /^\s+$/.test(current) && current.length >= INDENT.length) {
        event.preventDefault();
        replaceRange(p - INDENT.length, p, "}");
      }
      return;
    }
    if (event.key === "F9") {
      event.preventDefault();
      runCode();
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitCode();
    }
  }

  /* ---------------- 状态条 / 输出 ---------------- */
  function status(summary, extra) {
    $("run-summary").innerHTML = summary;
    $("status-extra").textContent = extra || "";
  }

  function consoleWrite(text) {
    $("console-out").hidden = false;
    $("review-body").hidden = true;
    $("console-out").textContent = text;
  }

  function showReview(html) {
    $("console-out").hidden = true;
    $("verdict-box").hidden = true;
    $("review-body").hidden = false;
    $("review-body").innerHTML = html;
  }

  /* ---------------- 测试点 ---------------- */
  function setTests(list) {
    tests = (list || []).filter(function (t) { return (t.input || "").trim() || (t.output || "").trim(); });
    renderSamples();
    $("prob-tests").textContent = "测试点 " + tests.length + " 组";
  }

  function renderSamples() {
    var box = $("samples");
    if (!tests.length) {
      box.innerHTML = '<p class="ide-hint">还没有测试点。把题目写进上面的框里就会自动生成。</p>';
      return;
    }
    var shown = tests.slice(0, 3);
    box.innerHTML = "";
    shown.forEach(function (t, i) {
      var card = document.createElement("div");
      card.className = "sample";
      card.innerHTML = '<div class="sample-head"><span>样例 #' + (i + 1) + "</span>" +
        '<span class="sample-acts"><button class="ide-mini" type="button" data-act="copy">复制</button>' +
        '<button class="ide-mini" type="button" data-act="run">运行</button></span></div>' +
        '<div class="sample-body"><div class="sample-col"><span class="sample-tag">输入</span><pre class="sample-in"></pre></div>' +
        '<div class="sample-col"><span class="sample-tag">输出</span><pre class="sample-out"></pre></div></div>';
      card.querySelector(".sample-in").textContent = t.input || "（空）";
      card.querySelector(".sample-out").textContent = t.output || "（空）";
      card.querySelector('[data-act="copy"]').addEventListener("click", function () {
        copyText(t.input || "", "样例输入已复制");
      });
      card.querySelector('[data-act="run"]').addEventListener("click", function () {
        $("console-stdin").value = t.input || "";
        runCode();
      });
      box.appendChild(card);
    });
    if (tests.length > shown.length) {
      var more = document.createElement("p");
      more.className = "ide-hint";
      more.textContent = "还有 " + (tests.length - shown.length) + " 组测试点，提交评测时会一起比对。";
      box.appendChild(more);
    }
  }

  function copyText(text, message) {
    var done = function () { if (message) V3.toast(message); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      return;
    }
    fallbackCopy(text);
    done();
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (err) { /* 忽略 */ }
    ta.remove();
  }

  /* ---------------- 生成进度 ---------------- */
  var STAGES = ["AI 正在读题面…", "正在设计边界数据…", "正在复核期望输出…"];

  function startGen(label) {
    var fill = $("gen-fill");
    var text = $("gen-text");
    var pct = 6;
    var stage = 0;
    fill.style.width = pct + "%";
    text.textContent = label || STAGES[0];
    var timer = setInterval(function () {
      pct = Math.min(93, pct + Math.max(0.7, (93 - pct) * 0.06));
      fill.style.width = pct + "%";
    }, 220);
    var stageTimer = setInterval(function () {
      stage = Math.min(STAGES.length - 1, stage + 1);
      text.textContent = STAGES[stage];
    }, 4200);
    return {
      step: function (message) { text.textContent = message; },
      done: function (message) {
        clearInterval(timer);
        clearInterval(stageTimer);
        fill.style.width = "100%";
        text.textContent = message;
        setTimeout(function () { fill.style.width = "0%"; }, 1400);
      },
      fail: function (message) {
        clearInterval(timer);
        clearInterval(stageTimer);
        fill.style.width = "0%";
        text.textContent = message;
      }
    };
  }

  async function generateTests(options) {
    var opts = options || {};
    if (generating) return;
    var requirement = $("code-requirement").value.trim();
    if (!requirement && !currentEntry) {
      V3.toast("先把题目要求贴进来", "error");
      return;
    }
    generating = true;
    var progress = startGen();
    try {
      var res = await V3.api("/api/v3/code/extract", {
        method: "POST",
        body: { requirement: requirement, entry_id: currentEntry, use_ai: false }
      });
      var found = res.tests || [];
      progress.step("AI 正在出测试点（最多 " + TEST_CAP + " 组）…");
      var ai = null;
      try {
        ai = await V3.api("/api/v3/code/generate", {
          method: "POST",
          body: { requirement: requirement, entry_id: currentEntry, count: TEST_CAP }
        });
      } catch (err) {
        var msg = String((err && err.message) || "");
        if (!opts._retried && /太快|限流|频率/.test(msg) && !/调用过多|额度/.test(msg)) {
          progress.step("AI 刚才被限流，3 秒后自动重试…");
          progress.fail("AI 刚才被限流，3 秒后自动重试…");
          generating = false;
          await new Promise(function (resolve) { setTimeout(resolve, 3600); });
          var retry = {};
          Object.keys(opts || {}).forEach(function (k) { retry[k] = opts[k]; });
          retry._retried = true;
          return generateTests(retry);
        }
        if (!found.length) throw err;
        progress.fail(/调用过多|额度/.test(msg) ? msg
          : "AI 暂时不可用，只用题面里的 " + found.length + " 组样例");
        setTests(found);
        return;
      }
      var merged = mergeTests(found, (ai && ai.tests) || []);
      setTests(merged);
      if (!merged.length) {
        progress.fail("没生成出测试点，检查一下题目是否写完整");
        return;
      }
      progress.done((ai && ai.note ? ai.note : "已生成测试点") + " · " + merged.length + " 组");
      if (!opts.silent) V3.toast("已生成 " + merged.length + " 组测试点");
    } catch (err) {
      progress.fail(err.message);
      V3.fail(err);
    } finally {
      generating = false;
    }
  }

  function mergeTests(first, second) {
    var out = [];
    var seen = {};
    first.concat(second).forEach(function (t) {
      var input = t.input || "";
      var output = t.output || "";
      if (!input.trim() && !output.trim()) return;
      var key = input + "\u0000" + output;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ input: input, output: output });
    });
    return out.slice(0, TEST_CAP);
  }

  function queueAutoGenerate() {
    if (suppressAuto) return;
    if (autoTimer) clearTimeout(autoTimer);
    var requirement = $("code-requirement").value.trim();
    if (requirement.length < 12) return;
    if (tests.length && !generating) return;
    autoTimer = setTimeout(function () {
      autoTimer = null;
      var text = $("code-requirement").value.trim();
      if (text.length < 12 || generating) return;
      if (tests.length) return;
      generateTests({ silent: true });
    }, 1400);
  }

  /* ---------------- 题目来源 ---------------- */
  function setRequirement(text) {
    var box = $("code-requirement");
    box.value = text;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }

  var autoProblemHeight = 0;

  function autoSizeProblem() {
    var box = $("code-requirement");
    if (!box) return;
    // 用户自己拖过高度就不要再改，免得一打字又缩回去
    if (box.dataset.manualHeight === "1") return;
    box.style.height = "auto";
    var need = box.scrollHeight + 4;
    var max = Math.max(240, Math.round(window.innerHeight * 0.58));
    var height = Math.min(Math.max(need, 132), max);
    box.style.height = height + "px";
    autoProblemHeight = height;
    // 永远允许框内滚动：内容刚好装下时不会出现滚动条，装不下就能上下翻
    box.style.overflowY = "auto";
  }

  function watchManualProblemResize() {
    var box = $("code-requirement");
    if (!box || box.dataset.manualWatch === "1") return;
    box.dataset.manualWatch = "1";
    box.addEventListener("pointerup", function () {
      if (autoProblemHeight && Math.abs(box.clientHeight - autoProblemHeight) > 3) {
        box.dataset.manualHeight = "1";
        box.style.overflowY = "auto";
      }
    });
    box.addEventListener("dblclick", function () {
      // 双击恢复自动高度
      delete box.dataset.manualHeight;
      autoProblemHeight = 0;
      autoSizeProblem();
    });
  }

  /* ---------------- AI 出题练习 ---------------- */
  function openPractice() {
    $("practice-modal").hidden = false;
    $("practice-status").textContent = "";
    $("practice-topic").focus();
  }

  function closePractice() {
    $("practice-modal").hidden = true;
  }

  async function runPractice() {
    var topic = ($("practice-topic").value || "").trim();
    if (topic.length < 2) {
      V3.toast("先写一个想练的知识点", "error");
      $("practice-topic").focus();
      return;
    }
    var level = $("practice-level").value || "基础";
    var go = $("practice-go");
    var tip = $("practice-status");
    go.disabled = true;
    tip.textContent = "AI 正在出题（" + topic + "）…";
    try {
      var res = await V3.api("/api/v3/code/practice", {
        method: "POST",
        body: { topic: topic, level: level }
      });
      currentEntry = null;
      $("crumb-title").textContent = res.title || topic;
      $("prob-title").textContent = res.title || topic;
      $("save-hint").textContent = "AI 出题 · " + topic;
      suppressAuto = true;
      setTests([]);
      setRequirement(res.requirement || "");
      suppressAuto = false;
      autoSizeProblem();
      var box = $("code-source");
      if (!box.value.trim() || box.value.indexOf("在这里写代码") >= 0) {
        box.value = "#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n";
        refreshGutter();
      }
      closePractice();
      V3.toast("题目已生成，正在准备测试点");
      status("题目已生成", topic);
      setTimeout(function () { generateTests({ silent: true }); }, 3600);
    } catch (err) {
      tip.textContent = err.message || "出题失败";
      V3.fail(err);
    } finally {
      go.disabled = false;
    }
  }

  function openBank() {
    $("bank-modal").hidden = false;
    $("bank-search").value = "";
    loadBank("");
    $("bank-search").focus();
  }

  function closeBank() {
    $("bank-modal").hidden = true;
  }

  async function loadBank() {
    var list = $("bank-list");
    list.innerHTML = '<p class="ide-hint">加载中…</p>';
    try {
      var res = await V3.api("/api/v3/code/bank");
      bankItems = res.items || [];
      renderBank("");
    } catch (err) {
      list.innerHTML = '<p class="ide-hint">' + V3.esc(err.message) + "</p>";
    }
  }

  function renderBank(keyword) {
    var list = $("bank-list");
    var kw = (keyword || "").trim().toLowerCase();
    var items = bankItems.filter(function (it) {
      if (!kw) return true;
      return (it.title + " " + it.chapter + " " + it.preview).toLowerCase().indexOf(kw) !== -1;
    });
    if (!items.length) {
      list.innerHTML = '<p class="ide-hint">' +
        (bankItems.length ? "没有匹配的题目" : "题库里还没有 C++ 题目，先到错题本里新建一道吧") + "</p>";
      return;
    }
    list.innerHTML = "";
    items.forEach(function (it) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ide-bank-item";
      btn.innerHTML = "<strong>" + V3.esc(it.title) + "</strong>" +
        '<span class="ide-bank-meta">' + V3.esc([it.chapter, it.test_count ? it.test_count + " 组测试点" : "无测试点",
          it.has_code ? "有代码" : ""].filter(Boolean).join(" · ")) + "</span>" +
        '<span class="ide-bank-preview">' + V3.esc(it.preview || "（题面为空）") + "</span>";
      btn.addEventListener("click", function () { loadEntry(it.id); });
      list.appendChild(btn);
    });
  }

  async function loadEntry(id) {
    try {
      var entry = await V3.api("/api/v3/code/entry/" + id);
      currentEntry = id;
      setRequirement(entry.problem || "");
      if (entry.code) $("code-source").value = entry.code;
      refreshGutter();
      setTests(entry.tests || []);
      $("crumb-title").textContent = entry.title || "题目";
      $("prob-title").textContent = entry.title || "题目";
      $("save-hint").textContent = "已载入题库题目";
      autoSizeProblem();
      closeBank();
      V3.toast("已载入「" + (entry.title || "题目") + "」");
      if (!tests.length && (entry.problem || "").trim().length >= 12) generateTests({ silent: true });
    } catch (err) {
      V3.fail(err);
    }
  }

  function pickImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      V3.toast("请选择图片文件", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      V3.toast("图片太大了，换一张小一点的", "error");
      return;
    }
    var reader = new FileReader();
    reader.onload = async function () {
      $("save-hint").textContent = "正在识别图片…";
      try {
        var res = await V3.api("/api/ai/ocr", {
          method: "POST",
          body: { attachments: [{ data: String(reader.result) }], kind: "cpp" }
        });
        var text = (res.text || "").trim();
        if (!text) {
          $("save-hint").textContent = "";
          V3.toast("图片里没识别到文字", "error");
          return;
        }
        var box = $("code-requirement");
        if (box.value.indexOf(text) === -1) {
          setRequirement(box.value.trim() ? box.value.trim() + "\n\n" + text : text);
        }
        $("save-hint").textContent = "题面已识别";
        V3.toast("题面已识别");
      } catch (err) {
        $("save-hint").textContent = "";
        V3.fail(err);
      } finally {
        $("problem-image").value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  /* ---------------- 运行 ---------------- */
  async function runCode() {
    refreshGutter();
    var button = $("run-code");
    var stdinText = $("console-stdin").value;
    button.disabled = true;
    $("verdict-box").hidden = true;
    $("review-body").hidden = true;
    $("console-out").hidden = false;
    status('<span class="v3-muted">编译并运行中…</span>');
    $("console-out").textContent = "";
    var started = Date.now();
    try {
      var res = await V3.api("/api/v3/code/run", {
        method: "POST",
        body: { source: $("code-source").value, stdin: stdinText }
      });
      var cost = ((Date.now() - started) / 1000).toFixed(1) + "s";
      if (!res.compiled) {
        consoleWrite("编译失败：\n" + (res.compile_error || "（没有错误信息）"));
        status('<span class="fail">编译失败</span>', cost);
        return;
      }
      var one = (res.results || [])[0] || {};
      var lines = [];
      if (one.stderr) lines.push("$ stderr\n" + one.stderr + "\n");
      lines.push(one.output || "（没有输出）");
      if (one.timeout) lines.push("\n（运行超时，已强制结束）");
      consoleWrite(lines.join("\n"));
      $("console-status").textContent = "运行完成 · 退出码 " +
        (one.exit === null || one.exit === undefined ? "—" : one.exit);
      status('<span class="pass">运行完成</span> <span class="v3-muted">只跑自测输入，不评测测试点</span>', cost);
    } catch (err) {
      status('<span class="fail">' + V3.esc(err.message) + "</span>");
      consoleWrite("运行失败：" + err.message);
    } finally {
      button.disabled = false;
    }
  }

  /* ---------------- 提交评测 ---------------- */
  function renderVerdict(res) {
    var box = $("verdict-box");
    var grid = $("verdict-grid");
    box.hidden = false;
    $("console-out").hidden = true;
    $("review-body").hidden = true;
    var verdict = res.verdict || "WA";
    var badge = $("verdict-badge");
    badge.textContent = verdict;
    badge.className = "verdict-badge v-" + verdict;
    $("verdict-text").textContent = res.total
      ? res.passed + " / " + res.total + " 个测试点通过"
      : (res.compiled ? "没有测试点" : "编译错误");
    grid.innerHTML = "";
    var names = {
      AC: "Accepted 通过", WA: "Wrong Answer 答案错误",
      TLE: "Time Limit Exceeded 超时", RE: "Runtime Error 运行错误",
      CE: "Compile Error 编译错误"
    };
    (res.results || []).forEach(function (r, i) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "verdict-cell v-" + (r.verdict || "WA");
      cell.innerHTML = '<span class="vc-idx">#' + (i + 1) + "</span>" +
        '<span class="vc-lab">' + (r.verdict || "WA") + "</span>";
      cell.title = "测试点 " + (i + 1) + "：" + (names[r.verdict] || r.verdict) +
        "\n输入：" + (r.input || "（空）") +
        "\n期望：" + (r.expected || "（空）") +
        "\n实际：" + (r.output || "（空）");
      cell.addEventListener("click", function () {
        $("console-out").hidden = false;
        $("console-out").textContent = "测试点 " + (i + 1) + "：" + (names[r.verdict] || r.verdict) +
          "\n  输入：" + (r.input || "（空）") +
          "\n  期望：" + (r.expected || "（空）") +
          "\n  实际：" + (r.output || "（空）") +
          (r.stderr ? "\n  stderr：" + r.stderr : "") +
          (r.timeout ? "\n  （超过 " + (r.time_limit || 3) + " 秒）" : "");
      });
      grid.appendChild(cell);
    });
  }

  async function submitCode() {
    if (!tests.length) {
      V3.toast("还没有测试点，正在按题面生成…");
      await generateTests({ silent: true });
      if (!tests.length) return;
    }
    refreshGutter();
    var button = $("submit-code");
    button.disabled = true;
    $("verdict-box").hidden = true;
    $("review-body").hidden = true;
    $("console-out").hidden = true;
    status('<span class="v3-muted">评测中…</span>');
    var started = Date.now();
    try {
      var res = await V3.api("/api/v3/code/run", {
        method: "POST",
        body: { source: $("code-source").value, tests: tests }
      });
      var cost = ((Date.now() - started) / 1000).toFixed(1) + "s";
      if (!res.compiled) {
        var badge = $("verdict-badge");
        $("verdict-box").hidden = false;
        badge.textContent = "CE";
        badge.className = "verdict-badge v-CE";
        $("verdict-text").textContent = "编译错误";
        $("verdict-grid").innerHTML = "";
        $("console-out").hidden = false;
        $("console-out").textContent = "编译失败：\n" + (res.compile_error || "（没有错误信息）");
        status('<span class="fail">Compile Error</span>', cost);
        return;
      }
      renderVerdict(res);
      status('<span class="' + (res.verdict === "AC" ? "pass" : "fail") + '">' + res.verdict +
        '</span> <span class="v3-muted">' + res.passed + " / " + res.total + " 通过</span>", cost);
    } catch (err) {
      status('<span class="fail">' + V3.esc(err.message) + "</span>");
    } finally {
      button.disabled = false;
    }
  }

  /* ---------------- AI 点评 ---------------- */
  async function aiReview() {
    $("ai-review").disabled = true;
    showReview('<p class="v3-muted">AI 正在看你的代码…</p>');
    try {
      var res = await V3.api("/api/v3/code/review", {
        method: "POST",
        body: {
          source: $("code-source").value,
          requirement: $("code-requirement").value,
          entry_id: currentEntry
        }
      });
      var r = res.review;
      showReview('<p class="rv-score"><strong>' + r.score + " 分</strong> · " + V3.esc(r.verdict) + "</p>" +
        (r.bugs && r.bugs.length
          ? "<ul>" + r.bugs.map(function (b) { return "<li>" + V3.esc(b) + "</li>"; }).join("") + "</ul>"
          : "") +
        (r.style ? '<p class="v3-muted">风格：' + V3.esc(r.style) + "</p>" : "") +
        (r.hint ? '<p class="v3-muted">下一步：' + V3.esc(r.hint) + "</p>" : ""));
    } catch (err) {
      showReview('<p class="fail">' + V3.esc(err.message) + "</p>");
    } finally {
      $("ai-review").disabled = false;
    }
  }

  /* ---------------- 绑定 ---------------- */
  var source = $("code-source");
  source.addEventListener("keydown", handleEditorKeys);
  source.addEventListener("input", refreshGutter);
  source.addEventListener("scroll", function () { $("gutter").scrollTop = source.scrollTop; });

  watchManualProblemResize();
  $("code-requirement").addEventListener("input", function () {
    autoSizeProblem();
    window.requestAnimationFrame(autoSizeProblem);
    queueAutoGenerate();
  });
  window.addEventListener("resize", autoSizeProblem);

  $("toggle-problem").addEventListener("click", function () {
    var app = document.querySelector(".ide-app");
    var hidden = app.classList.toggle("problem-hidden");
    $("toggle-problem").textContent = hidden ? "展开题目" : "收起题目";
  });

  $("toggle-console").addEventListener("click", function () {
    document.querySelector(".ide-work").classList.toggle("console-hidden");
  });

  $("copy-code").addEventListener("click", function () {
    copyText(source.value, "代码已复制");
  });

  $("pick-practice").addEventListener("click", openPractice);
  $("practice-close").addEventListener("click", closePractice);
  $("practice-modal").addEventListener("click", function (event) {
    if (event.target === $("practice-modal")) closePractice();
  });
  $("practice-go").addEventListener("click", runPractice);
  $("practice-topic").addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); runPractice(); }
  });
  $("practice-chips").addEventListener("click", function (event) {
    var b = event.target.closest("[data-topic]");
    if (!b) return;
    $("practice-topic").value = b.dataset.topic;
    $("practice-topic").focus();
  });
  $("pick-bank").addEventListener("click", openBank);
  $("bank-close").addEventListener("click", closeBank);
  $("bank-modal").addEventListener("click", function (event) {
    if (event.target === $("bank-modal")) closeBank();
  });
  $("bank-search").addEventListener("input", function () { renderBank(this.value); });
  $("pick-image").addEventListener("click", function () { $("problem-image").click(); });
  $("problem-image").addEventListener("change", function () { pickImage(this.files[0]); });
  $("regenerate").addEventListener("click", function () { generateTests({}); });
  $("run-code").addEventListener("click", runCode);
  $("submit-code").addEventListener("click", submitCode);
  $("ai-review").addEventListener("click", aiReview);

  $("save-code").addEventListener("click", async function () {
    if (!currentEntry) {
      V3.toast("先从题库选一道题，或在错题详情里进来", "error");
      return;
    }
    try {
      await V3.api("/api/v3/code/save", {
        method: "POST",
        body: {
          entry_id: currentEntry,
          source: source.value,
          tests: tests,
          notes: $("code-requirement").value
        }
      });
      V3.toast("已保存");
      $("save-hint").textContent = "已保存";
    } catch (err) {
      V3.fail(err);
    }
  });

  refreshGutter();
  autoSizeProblem();

  (async function () {
    try {
      await V3.boot();
      var health = await V3.api("/api/v3/code/health");
      $("judge-status").textContent = health.judge ? "判题环境就绪" : "判题镜像未安装";
      $("judge-status").className = "v3-chip " + (health.judge ? "ok" : "warn");
      if (entryId) {
        try {
          var entry = await V3.api("/api/v3/code/entry/" + entryId);
          $("code-requirement").value = entry.problem || "";
          if (entry.code) source.value = entry.code;
          $("crumb-title").textContent = entry.title || "题目";
          $("prob-title").textContent = entry.title || "题目";
          $("save-hint").textContent = "绑定题目：" + (entry.title || "");
          autoSizeProblem();
          refreshGutter();
          setTests(entry.tests || []);
          if (!tests.length && (entry.problem || "").trim().length >= 12) generateTests({ silent: true });
        } catch (err) {
          /* 普通演练模式 */
        }
      }
    } catch (err) {
      V3.fail(err);
    }
  })();
})();
