/* v3-code.js — IDE 页面（洛谷风格）：编辑、运行、测试点、控制台。 */
(function () {
  var entryId = document.body.dataset.entryId || "";
  var currentEntry = entryId;
  var bankItems = [];
  var $ = function (id) { return document.getElementById(id); };
  var INDENT = "    ";

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
      // 用 execCommand 插入可以保留撤销栈
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

  /* ---------------- 面板切换 ---------------- */
  function showTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".ide-tab"), function (tab) {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".ide-tabpane"), function (pane) {
      pane.hidden = pane.dataset.pane !== name;
    });
  }

  /* ---------------- 测试点 ---------------- */
  function testRow(input, output) {
    var row = document.createElement("div");
    row.className = "test-row";
    row.innerHTML = '<label class="test-lab">输入</label>' +
      '<textarea class="v3-textarea" placeholder="输入（程序 cin 读到的内容）" spellcheck="false"></textarea>' +
      '<label class="test-lab">期望输出</label>' +
      '<textarea class="v3-textarea" placeholder="期望输出" spellcheck="false"></textarea>' +
      '<button class="ide-btn small ghost" type="button" title="删除">×</button>';
    row.querySelectorAll("textarea")[0].value = input || "";
    row.querySelectorAll("textarea")[1].value = output || "";
    row.querySelector("button").addEventListener("click", function () { row.remove(); });
    $("test-list").appendChild(row);
    return row;
  }

  function readTests() {
    return Array.prototype.map.call(document.querySelectorAll("#test-list .test-row"), function (row) {
      var t = row.querySelectorAll("textarea");
      return { input: t[0].value, output: t[1].value };
    }).filter(function (t) { return t.input.trim() || t.output.trim(); });
  }

  function fillTests(tests) {
    Array.prototype.forEach.call(document.querySelectorAll("#test-list .test-row"), function (row) {
      var t = row.querySelectorAll("textarea");
      if (!t[0].value.trim() && !t[1].value.trim()) row.remove();
    });
    var existing = {};
    readTests().forEach(function (t) { existing[t.input + "\u0000" + t.output] = 1; });
    tests.forEach(function (t) {
      var key = (t.input || "") + "\u0000" + (t.output || "");
      if (!existing[key]) {
        testRow(t.input, t.output);
        existing[key] = 1;
      }
    });
    if (!document.querySelector("#test-list .test-row")) testRow("", "");
  }

  function hasContent(tests) {
    return tests.some(function (t) { return t.input.trim() || t.output.trim(); });
  }

  /* ---------------- 输出 ---------------- */
  function consoleWrite(text) {
    $("console-out").textContent = text;
  }

  function status(summary, extra) {
    $("run-summary").innerHTML = summary;
    $("status-extra").textContent = extra || "";
  }

  function renderConsoleTests(res) {
    if (!res.compiled) {
      consoleWrite("编译失败：\n" + (res.compile_error || "（没有错误信息）"));
      return;
    }
    var lines = [];
    (res.results || []).forEach(function (r, i) {
      lines.push("测试点 " + (i + 1) + "：" + (r.ok ? "通过" : "未通过") + (r.timeout ? "（超时）" : ""));
      lines.push("  输入：" + (r.input || "（空）"));
      lines.push("  期望：" + (r.expected || "（空）"));
      lines.push("  实际：" + (r.output || "（空）"));
      if (r.stderr) lines.push("  stderr：" + r.stderr);
    });
    consoleWrite(lines.join("\n"));
  }

  /* ---------------- 动作 ---------------- */
  async function extractTests(useAi) {
    var button = $("extract-tests");
    var requirement = $("code-requirement").value.trim();
    if (!requirement && !entryId) {
      V3.toast("先把题目要求贴进来", "error");
      return;
    }
    button.disabled = true;
    $("extract-hint").textContent = useAi ? "AI 正在读题面…" : "正在识别题面里的样例…";
    try {
      var res = await V3.api("/api/v3/code/extract", {
        method: "POST",
        body: { requirement: requirement, entry_id: currentEntry, use_ai: !!useAi }
      });
      if (!res.tests || !res.tests.length) {
        if (!useAi) {
          button.disabled = false;
          return extractTests(true);
        }
        $("extract-hint").textContent = res.note || "题面里没有样例，手动加测试点吧";
        return;
      }
      fillTests(res.tests);
      showTab("tests");
      $("extract-hint").textContent = (res.note || "") + "（可以先核对再运行）";
      V3.toast("已添加 " + res.tests.length + " 组测试点");
    } catch (err) {
      $("extract-hint").textContent = "";
      V3.fail(err);
    } finally {
      button.disabled = false;
    }
  }

  /* ---------------- 题目来源：题库 / 图片 ---------------- */
  function setRequirement(text) {
    var box = $("code-requirement");
    box.value = text;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function clearTests() {
    Array.prototype.forEach.call(document.querySelectorAll("#test-list .test-row"), function (row) {
      row.remove();
    });
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

  async function loadBank(keyword) {
    var list = $("bank-list");
    list.innerHTML = '<p class="ide-hint">加载中…</p>';
    try {
      var res = await V3.api("/api/v3/code/bank");
      bankItems = res.items || [];
      renderBank(keyword);
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
      list.innerHTML = '<p class="ide-hint">' + (bankItems.length ? "没有匹配的题目" : "题库里还没有 C++ 题目，先到错题本里 new 一道吧") + "</p>";
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
      if (entry.code) {
        $("code-source").value = entry.code;
      }
      clearTests();
      (entry.tests || []).forEach(function (t) { testRow(t.input, t.output); });
      if (!document.querySelector("#test-list .test-row")) testRow("", "");
      refreshGutter();
      $("save-hint").textContent = "题目：" + (entry.title || "");
      closeBank();
      showTab("tests");
      V3.toast("已载入「" + (entry.title || "题目") + "」");
      if (!hasContent(readTests()) && (entry.problem || "").trim()) {
        extractTests(true);
      }
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
      var hint = $("save-hint");
      hint.textContent = "正在识别图片…";
      try {
        var res = await V3.api("/api/ai/ocr", {
          method: "POST",
          body: { attachments: [{ data: String(reader.result) }], kind: "cpp" }
        });
        var text = (res.text || "").trim();
        if (!text) {
          hint.textContent = "";
          V3.toast("图片里没识别到文字", "error");
          return;
        }
        var box = $("code-requirement");
        if (box.value.indexOf(text) === -1) {
          setRequirement(box.value.trim() ? box.value.trim() + "\n\n" + text : text);
        }
        hint.textContent = "已识别题面";
        V3.toast("题面已识别");
        autoTried = false;
        if (!hasContent(readTests())) extractTests(true);
      } catch (err) {
        hint.textContent = "";
        V3.fail(err);
      } finally {
        $("problem-image").value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  async function generateTests() {
    var button = $("generate-tests");
    var requirement = $("code-requirement").value.trim();
    if (!requirement && !currentEntry) {
      V3.toast("先把题目要求贴进来", "error");
      return;
    }
    button.disabled = true;
    var hint = $("extract-hint");
    showTab("tests");
    hint.textContent = "AI 正在读题、补边界数据…";
    try {
      var res = await V3.api("/api/v3/code/generate", {
        method: "POST",
        body: { requirement: requirement, entry_id: currentEntry, count: 10 }
      });
      fillTests(res.tests || []);
      hint.textContent = res.note || "已生成测试点";
      V3.toast("AI 出了 " + (res.tests || []).length + " 组测试点，已复核期望输出");
    } catch (err) {
      $("extract-hint").textContent = "";
      V3.fail(err);
    } finally {
      button.disabled = false;
    }
  }

  async function runCode() {
    refreshGutter();
    var button = $("run-code");
    var stdinText = $("console-stdin").value;
    button.disabled = true;
    showTab("output");
    $("verdict-box").hidden = true;
    status('<span class="v3-muted">编译并运行中…</span>');
    consoleWrite("");
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
      if (stdinText) lines.push("$ 键盘输入\n" + stdinText + "\n");
      lines.push("$ 程序输出\n" + (one.output || "（没有输出）"));
      if (one.stderr) lines.push("\n$ stderr\n" + one.stderr);
      if (one.timeout) lines.push("\n（运行超时，已强制结束）");
      lines.push("\n$ 退出码 " + (one.exit === null || one.exit === undefined ? "—" : one.exit));
      consoleWrite(lines.join("\n"));
      $("console-status").textContent = "运行完成";
      status('<span class="pass">运行完成</span> <span class="v3-muted">只跑控制台输入，不评测测试点</span>', cost);
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
        consoleWrite("测试点 " + (i + 1) + "：" + (names[r.verdict] || r.verdict) +
          "\n  输入：" + (r.input || "（空）") +
          "\n  期望：" + (r.expected || "（空）") +
          "\n  实际：" + (r.output || "（空）") +
          (r.stderr ? "\n  stderr：" + r.stderr : "") +
          (r.timeout ? "\n  （超过 " + (r.time_limit || 3) + " 秒）" : ""));
      });
      grid.appendChild(cell);
    });
  }

  async function submitCode() {
    var tests = readTests();
    if (!tests.length) {
      V3.toast("还没有测试点：先在「测试数据」里加点，或用 AI 出测试点");
      showTab("tests");
      return;
    }
    refreshGutter();
    var button = $("submit-code");
    button.disabled = true;
    showTab("output");
    $("verdict-box").hidden = true;
    consoleWrite("");
    status('<span class="v3-muted">评测中…</span>');
    var started = Date.now();
    try {
      var res = await V3.api("/api/v3/code/run", {
        method: "POST",
        body: { source: $("code-source").value, tests: tests }
      });
      var cost = ((Date.now() - started) / 1000).toFixed(1) + "s";
      if (!res.compiled) {
        $("verdict-box").hidden = false;
        var badge = $("verdict-badge");
        badge.textContent = "CE";
        badge.className = "verdict-badge v-CE";
        $("verdict-text").textContent = "编译错误";
        $("verdict-grid").innerHTML = "";
        consoleWrite("编译失败：\n" + (res.compile_error || "（没有错误信息）"));
        status('<span class="fail">Compile Error</span>', cost);
        showTab("output");
        return;
      }
      renderVerdict(res);
      var lines = [];
      (res.results || []).forEach(function (r, i) {
        lines.push("测试点 " + (i + 1) + "：" + r.verdict);
        if (r.verdict !== "AC") {
          lines.push("  输入：" + (r.input || "（空）"));
          lines.push("  期望：" + (r.expected || "（空）"));
          lines.push("  实际：" + (r.output || "（空）"));
          if (r.stderr) lines.push("  stderr：" + r.stderr);
        }
      });
      consoleWrite(lines.join("\n") || "（没有测试点）");
      status('<span class="' + (res.verdict === "AC" ? "pass" : "fail") + '">' +
        res.verdict + "</span> <span class=\"v3-muted\">" + res.passed + " / " + res.total + " 通过</span>", cost);
    } catch (err) {
      status('<span class="fail">' + V3.esc(err.message) + "</span>");
      consoleWrite("评测失败：" + err.message);
    } finally {
      button.disabled = false;
    }
  }

  async function consoleRun() {
    return runCode();
  }

  async function aiReview() {
    $("ai-review").disabled = true;
    showTab("review");
    $("review-body").innerHTML = '<p class="v3-muted">AI 正在看你的代码…</p>';
    try {
      var res = await V3.api("/api/v3/code/review", {
        method: "POST",
        body: { source: $("code-source").value, requirement: $("code-requirement").value, entry_id: currentEntry }
      });
      var r = res.review;
      $("review-body").innerHTML = '<p style="margin:0 0 6px"><strong>' + r.score + " 分</strong> · " + V3.esc(r.verdict) + "</p>" +
        (r.bugs && r.bugs.length ? "<ul>" + r.bugs.map(function (b) { return "<li>" + V3.esc(b) + "</li>"; }).join("") + "</ul>" : "") +
        (r.style ? '<p class="v3-muted">风格：' + V3.esc(r.style) + "</p>" : "") +
        (r.hint ? '<p class="v3-muted">下一步：' + V3.esc(r.hint) + "</p>" : "");
    } catch (err) {
      $("review-body").innerHTML = '<p class="fail">' + V3.esc(err.message) + "</p>";
    } finally {
      $("ai-review").disabled = false;
    }
  }

  /* ---------------- 绑定 ---------------- */
  var source = $("code-source");
  source.addEventListener("keydown", handleEditorKeys);
  source.addEventListener("input", refreshGutter);
  source.addEventListener("scroll", function () { $("gutter").scrollTop = source.scrollTop; });

  Array.prototype.forEach.call(document.querySelectorAll(".ide-tab"), function (tab) {
    tab.addEventListener("click", function () { showTab(tab.dataset.tab); });
  });

  $("toggle-problem").addEventListener("click", function () {
    var app = document.querySelector(".ide-app");
    var hidden = app.classList.toggle("problem-hidden");
    $("toggle-problem").textContent = hidden ? "展开" : "收起";
  });

  $("add-test").addEventListener("click", function () { testRow("", ""); });
  $("pick-bank").addEventListener("click", openBank);
  $("bank-close").addEventListener("click", closeBank);
  $("bank-modal").addEventListener("click", function (event) { if (event.target === $("bank-modal")) closeBank(); });
  $("bank-search").addEventListener("input", function () { renderBank(this.value); });
  $("pick-image").addEventListener("click", function () { $("problem-image").click(); });
  $("problem-image").addEventListener("change", function () { pickImage(this.files[0]); });
  $("generate-tests").addEventListener("click", generateTests);
  $("extract-tests").addEventListener("click", function () { extractTests(false); });
  $("run-code").addEventListener("click", runCode);
  $("submit-code").addEventListener("click", submitCode);
  $("console-run").addEventListener("click", consoleRun);
  $("console-clear").addEventListener("click", function () {
    consoleWrite("（还没有运行）");
    $("console-status").textContent = "";
  });
  $("ai-review").addEventListener("click", aiReview);
  $("save-code").addEventListener("click", async function () {
    if (!currentEntry) {
      V3.toast("先从题库选一道题，或在错题详情里进来", "error");
      return;
    }
    try {
      await V3.api("/api/v3/code/save", {
        method: "POST",
        body: { entry_id: currentEntry, source: $("code-source").value, tests: readTests(), notes: $("code-requirement").value }
      });
      V3.toast("已保存");
    } catch (err) {
      V3.fail(err);
    }
  });

  var autoTried = false;
  $("code-requirement").addEventListener("blur", function () {
    if (autoTried || hasContent(readTests())) return;
    if (!$("code-requirement").value.trim()) return;
    autoTried = true;
    extractTests(false);
  });

  refreshGutter();

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
          if (entry.tests && entry.tests.length) {
            entry.tests.forEach(function (t) { testRow(t.input, t.output); });
          }
          $("save-hint").textContent = "绑定题目：" + (entry.title || "");
        } catch (err) {
          /* 普通演练模式 */
        }
      }
      if (!document.querySelector("#test-list .test-row")) testRow("", "");
      refreshGutter();
      if (entryId && !hasContent(readTests()) && $("code-requirement").value.trim()) {
        autoTried = true;
        extractTests(false);
      }
    } catch (err) {
      V3.fail(err);
    }
  })();
})();
