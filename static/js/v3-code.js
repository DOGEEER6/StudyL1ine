/* v3-code.js — extracted from templates/code.html (CSP blocks inline scripts). */
(function () {
  var entryId = document.body.dataset.entryId || "";
  var $ = function (id) { return document.getElementById(id); };

  function testRow(input, output) {
    var row = document.createElement('div');
    row.className = 'test-row';
    row.innerHTML = '<textarea class="v3-textarea" placeholder="输入（程序用 cin 读到的内容）" spellcheck="false"></textarea>' +
      '<textarea class="v3-textarea" placeholder="期望输出" spellcheck="false"></textarea>' +
      '<button class="v3-btn small ghost" type="button" title="删除">×</button>';
    row.querySelectorAll('textarea')[0].value = input || '';
    row.querySelectorAll('textarea')[1].value = output || '';
    row.querySelector('button').addEventListener('click', function () { row.remove(); });
    $('test-list').appendChild(row);
    return row;
  }

  function readTests() {
    return Array.from(document.querySelectorAll('#test-list .test-row')).map(function (row) {
      var t = row.querySelectorAll('textarea');
      return { input: t[0].value, output: t[1].value };
    }).filter(function (t) { return t.input.trim() || t.output.trim(); });
  }

  function fillTests(tests) {
    var rows = Array.from(document.querySelectorAll('#test-list .test-row'));
    var blank = rows.filter(function (row) {
      var t = row.querySelectorAll('textarea');
      return !t[0].value.trim() && !t[1].value.trim();
    });
    blank.forEach(function (row) { row.remove(); });
    var existing = new Set(readTests().map(function (t) { return t.input + '\u0000' + t.output; }));
    tests.forEach(function (t) {
      var key = (t.input || '') + '\u0000' + (t.output || '');
      if (!existing.has(key)) {
        testRow(t.input, t.output);
        existing.add(key);
      }
    });
    if (!document.querySelector('#test-list .test-row')) testRow('', '');
  }

  function hasContent(tests) {
    return tests.some(function (t) { return t.input.trim() || t.output.trim(); });
  }

  function consoleWrite(text) {
    $('console-out').textContent = text;
  }

  function renderConsoleRun(res, stdinText) {
    if (!res.compiled) {
      consoleWrite('编译失败：\n' + (res.compile_error || '（没有错误信息）'));
      $('console-status').textContent = '编译失败';
      return;
    }
    var one = (res.results || [])[0] || {};
    var lines = [];
    if (stdinText) lines.push('$ 键盘输入\n' + stdinText + '\n');
    lines.push('$ 程序输出');
    lines.push(one.output || '（没有输出）');
    if (one.stderr) lines.push('\n$ stderr\n' + one.stderr);
    if (one.timeout) lines.push('\n（运行超时，已强制结束）');
    lines.push('\n$ 退出码 ' + (one.exit === null || one.exit === undefined ? '—' : one.exit));
    consoleWrite(lines.join('\n'));
    $('console-status').textContent = '运行完成';
  }

  function renderConsoleTests(res) {
    if (!res.compiled) {
      consoleWrite('编译失败：\n' + (res.compile_error || '（没有错误信息）'));
      return;
    }
    var lines = [];
    (res.results || []).forEach(function (r, i) {
      lines.push('测试点 ' + (i + 1) + '：' + (r.ok ? '通过' : '未通过') + (r.timeout ? '（超时）' : ''));
      lines.push('  输入：' + (r.input || '（空）'));
      lines.push('  期望：' + (r.expected || '（空）'));
      lines.push('  实际：' + (r.output || '（空）'));
      if (r.stderr) lines.push('  stderr：' + r.stderr);
    });
    consoleWrite(lines.join('\n'));
  }

  async function extractTests(useAi) {
    var btn = $('extract-tests');
    var requirement = $('code-requirement').value.trim();
    if (!requirement && !entryId) {
      V3.toast('先把题目要求贴进来', 'error');
      return;
    }
    btn.disabled = true;
    $('extract-hint').textContent = useAi ? 'AI 正在读题面…' : '正在识别题面里的样例…';
    try {
      var res = await V3.api('/api/v3/code/extract', {
        method: 'POST',
        body: { requirement: requirement, entry_id: entryId, use_ai: !!useAi }
      });
      if (!res.tests || !res.tests.length) {
        if (!useAi) { btn.disabled = false; return extractTests(true); }
        $('extract-hint').textContent = res.note || '题面里没有样例，手动加测试点吧';
        return;
      }
      fillTests(res.tests);
      $('extract-hint').textContent = (res.note || '') + '（可以先核对一下再运行）';
      V3.toast('已添加 ' + res.tests.length + ' 组测试点');
    } catch (err) {
      $('extract-hint').textContent = '';
      V3.fail(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function runCode() {
    var source = $('code-source').value;
    var tests = readTests();
    $('run-code').disabled = true;
    $('result-card').hidden = false;
    $('run-summary').innerHTML = '<span class="v3-muted">编译并运行中…</span>';
    $('run-detail').textContent = '';
    try {
      var res = await V3.api('/api/v3/code/run', { method: 'POST', body: { source: source, tests: tests } });
      renderConsoleTests(res);
      if (!res.compiled) {
        $('run-summary').innerHTML = '<span class="fail">编译失败</span>';
        $('run-detail').textContent = res.compile_error || '';
        return;
      }
      if (res.preview) {
        var one = res.results[0] || {};
        $('run-summary').innerHTML = '<span class="pass">运行完成</span> <span class="v3-muted">（还没写测试点，只显示输出）</span>';
        $('run-detail').textContent = '输出：' + (one.output || '（空）') +
          (one.timeout ? '\n（运行超时）' : '') +
          (one.stderr ? '\nstderr：' + one.stderr : '');
        return;
      }
      var pass = res.results.filter(function (r) { return r.ok; }).length;
      $('run-summary').innerHTML = '<span class="' + (pass === res.results.length ? 'pass' : 'fail') + '">' +
        pass + ' / ' + res.results.length + ' 个测试点通过</span>';
      $('run-detail').textContent = res.results.map(function (r, i) {
        return '测试点 ' + (i + 1) + '：' + (r.ok ? '通过' : '未通过') +
          (r.timeout ? '（超时）' : '') +
          '\n  输入：' + (r.input || '（空）') +
          '\n  期望：' + (r.expected || '（空）') +
          '\n  实际：' + (r.output || '（空）') +
          (r.stderr ? '\n  stderr：' + r.stderr : '');
      }).join('\n\n');
    } catch (err) {
      $('run-summary').innerHTML = '<span class="fail">' + V3.esc(err.message) + '</span>';
      consoleWrite('运行失败：' + err.message);
    } finally {
      $('run-code').disabled = false;
    }
  }

  async function consoleRun() {
    var btn = $('console-run');
    var stdinText = $('console-stdin').value;
    btn.disabled = true;
    $('console-status').textContent = '编译并运行中…';
    consoleWrite('');
    try {
      var res = await V3.api('/api/v3/code/run', {
        method: 'POST',
        body: { source: $('code-source').value, stdin: stdinText }
      });
      renderConsoleRun(res, stdinText);
    } catch (err) {
      $('console-status').textContent = '运行失败';
      consoleWrite('运行失败：' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function aiReview() {
    $('ai-review').disabled = true;
    $('review-card').hidden = false;
    $('review-body').innerHTML = '<span class="v3-muted">AI 正在看你的代码…</span>';
    try {
      var res = await V3.api('/api/v3/code/review', {
        method: 'POST',
        body: { source: $('code-source').value, requirement: $('code-requirement').value, entry_id: entryId }
      });
      var r = res.review;
      $('review-body').innerHTML = '<p style="margin:0 0 6px"><strong>' + r.score + ' 分</strong> · ' + V3.esc(r.verdict) + '</p>' +
        (r.bugs && r.bugs.length ? '<ul>' + r.bugs.map(function (b) { return '<li>' + V3.esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        (r.style ? '<p class="v3-muted">风格：' + V3.esc(r.style) + '</p>' : '') +
        (r.hint ? '<p class="v3-muted">下一步：' + V3.esc(r.hint) + '</p>' : '');
    } catch (err) {
      $('review-body').innerHTML = '<p class="fail">' + V3.esc(err.message) + '</p>';
    } finally {
      $('ai-review').disabled = false;
    }
  }

  $('add-test').addEventListener('click', function () { testRow('', ''); });
  $('extract-tests').addEventListener('click', function () { extractTests(false); });
  $('run-code').addEventListener('click', runCode);
  $('console-run').addEventListener('click', consoleRun);
  $('console-clear').addEventListener('click', function () {
    consoleWrite('（还没有运行）');
    $('console-status').textContent = '';
  });
  $('ai-review').addEventListener('click', aiReview);
  $('save-code').addEventListener('click', async function () {
    if (!entryId) { V3.toast('从错题详情进入才能保存', 'error'); return; }
    try {
      await V3.api('/api/v3/code/save', {
        method: 'POST',
        body: { entry_id: entryId, source: $('code-source').value, tests: readTests(), notes: $('code-requirement').value }
      });
      V3.toast('已保存');
    } catch (err) { V3.fail(err); }
  });
  var autoTried = false;
  $('code-requirement').addEventListener('blur', function () {
    if (autoTried || hasContent(readTests())) return;
    if (!$('code-requirement').value.trim()) return;
    autoTried = true;
    extractTests(false);
  });

  (async function () {
    try {
      await V3.boot();
      var health = await V3.api('/api/v3/code/health');
      $('judge-status').textContent = health.judge ? '判题环境就绪' : '判题镜像未安装';
      $('judge-status').className = 'v3-chip ' + (health.judge ? 'ok' : 'warn');
      if (entryId) {
        try {
          var entry = await V3.api('/api/v3/code/entry/' + entryId);
          $('code-requirement').value = entry.problem || '';
          if (entry.code) $('code-source').value = entry.code;
          if (entry.tests && entry.tests.length) {
            entry.tests.forEach(function (t) { testRow(t.input, t.output); });
          }
          $('save-hint').textContent = '绑定题目：' + (entry.title || '');
        } catch (err) { /* 普通演练模式 */ }
      }
      if (!document.querySelector('#test-list .test-row')) testRow('', '');
      // 从错题进来且题面有样例时，自动把测试点填好
      if (entryId && !hasContent(readTests()) && $('code-requirement').value.trim()) {
        autoTried = true;
        extractTests(false);
      }
    } catch (err) { V3.fail(err); }
  })();
})();
