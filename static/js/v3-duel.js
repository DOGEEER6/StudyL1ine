/* v3-duel.js — extracted from templates/duel.html (CSP blocks inline scripts). */
(function () {
  var state = { duel: null, index: 0, startedAt: 0, timer: null };
  var $ = function (id) { return document.getElementById(id); };

  function show(view) {
    ['view-home', 'view-play', 'view-result'].forEach(function (id) { $(id).hidden = (id !== view); });
  }

  function subjectSelect() {
    $('duel-subject').innerHTML = V3.subjects.map(function (s) {
      return '<option value="' + V3.esc(s.id) + '">' + V3.esc(s.name) + '</option>';
    }).join('');
  }

  async function loadHome() {
    try {
      var data = await V3.api('/api/v3/duels');
      var list = $('duel-list');
      list.innerHTML = data.duels.length ? data.duels.map(function (d) {
        var label = d.status === 'waiting' ? '等待对手加入' : d.status === 'finished' ? (d.result || '已结束') : d.status === 'ready' ? '可以开始' : '进行中';
        return '<div class="v3-card" data-id="' + V3.esc(d.id) + '" style="cursor:pointer;padding:14px">' +
          '<div style="display:flex;justify-content:space-between;gap:8px">' +
          '<strong>' + V3.esc(d.subject_name) + '</strong><span class="v3-chip">' + V3.esc(d.is_host ? '我发起' : '我受邀') + '</span></div>' +
          '<p class="v3-muted" style="margin:6px 0 0">' + V3.esc(label) + ' · 邀请码 ' + V3.esc(d.code) + '</p></div>';
      }).join('') : '<div class="v3-empty">还没有对局，先创建一个邀请同学吧。</div>';
      list.querySelectorAll('[data-id]').forEach(function (el) {
        el.addEventListener('click', function () { openDuel(el.dataset.id); });
      });

      var lobby = await V3.api('/api/v3/duels/lobby');
      var box = $('duel-lobby');
      box.innerHTML = lobby.duels.length ? lobby.duels.map(function (d) {
        return '<div class="v3-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<div><strong>' + V3.esc(d.subject_name) + '</strong><p class="v3-muted" style="margin:4px 0 0">' +
          V3.esc(d.host) + ' 发起 · ' + d.count + ' 题</p></div>' +
          '<button class="v3-btn small primary" data-join="' + V3.esc(d.code) + '" type="button">加入</button></div>';
      }).join('') : '<div class="v3-empty">大厅暂时没人。</div>';
      box.querySelectorAll('[data-join]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var res = await V3.api('/api/v3/duels/join', { method: 'POST', body: { code: b.dataset.join } });
            openDuel(res.id);
          } catch (err) { V3.fail(err); }
        });
      });
    } catch (err) { V3.fail(err); }
  }

  async function openDuel(id) {
    try {
      var data = await V3.api('/api/v3/duels/' + id);
      var duel = data.duel;
      state.duel = duel;
      if (duel.status === 'waiting') {
        show('view-result');
        $('result-title').textContent = '等待对手加入';
        $('result-body').innerHTML = '<p>把这个邀请码发给同学：</p><p class="duel-code">' + V3.esc(duel.code) + '</p>' +
          '<p class="v3-muted">他加入后，你们就会拿到同一套题（' + duel.total + ' 题）。</p>';
        return;
      }
      if (duel.status === 'finished') { return showResult(id); }
      startPlay(duel);
    } catch (err) { V3.fail(err); }
  }

  function startPlay(duel) {
    show('view-play');
    $('play-subject').textContent = duel.subject_name;
    $('play-meta').textContent = '共 ' + duel.total + ' 题 · 答得又快又准的人赢';
    state.index = 0;
    renderQuestion();
  }

  function renderQuestion() {
    var duel = state.duel;
    var q = duel.questions[state.index];
    if (!q) { return finish(); }
    $('play-title').textContent = '第 ' + (state.index + 1) + ' / ' + duel.total + ' 题';
    $('play-problem').textContent = q.problem || q.title;
    $('play-answer').value = '';
    $('play-feedback').textContent = '';
    $('play-progress').innerHTML = duel.questions.map(function (item, i) {
      var cls = i === state.index ? 'now' : '';
      var rec = duel.mine.answers[i];
      if (rec) cls = rec.correct ? 'ok' : 'bad';
      return '<i class="' + cls + '"></i>';
    }).join('');
    state.startedAt = Date.now();
    clearInterval(state.timer);
    state.timer = setInterval(function () {
      $('play-timer').textContent = ((Date.now() - state.startedAt) / 1000).toFixed(1) + 's';
    }, 100);
    $('play-answer').focus();
  }

  async function submitAnswer() {
    var duel = state.duel;
    var q = duel.questions[state.index];
    var text = $('play-answer').value.trim();
    if (!text) { V3.toast('先写答案再提交', 'error'); return; }
    var seconds = (Date.now() - state.startedAt) / 1000;
    try {
      var res = await V3.api('/api/v3/duels/' + duel.id + '/answer', {
        method: 'POST', body: { idx: state.index, text: text, seconds: seconds }
      });
      duel.mine.answers[state.index] = { correct: res.correct, seconds: seconds };
      $('play-feedback').textContent = res.correct ? '✓ 答对了' : '✗ 不太对，先记下来，交卷后能看正确答案（结果页）';
      state.index += 1;
      setTimeout(renderQuestion, 500);
    } catch (err) { V3.fail(err); }
  }

  async function finish() {
    clearInterval(state.timer);
    var duel = state.duel;
    try {
      await V3.api('/api/v3/duels/' + duel.id + '/submit', { method: 'POST', body: {} });
      showResult(duel.id);
    } catch (err) { V3.fail(err); }
  }

  async function showResult(id) {
    try {
      var data = await V3.api('/api/v3/duels/' + id + '/result');
      show('view-result');
      var finished = data.status === 'finished';
      $('result-title').textContent = finished ? '对战结果' : '已交卷，等对手完成';
      var rows = data.players.map(function (p) {
        return '<tr><td>' + V3.esc(p.name) + (p.you ? '（你）' : '') + '</td><td>' + p.score + ' / ' + p.total + '</td><td>' + p.seconds + 's</td></tr>';
      }).join('');
      $('result-body').innerHTML = rows
        ? '<table style="width:100%;border-collapse:collapse;margin-top:10px"><thead><tr style="text-align:left;color:var(--v3-muted);font-size:13px"><th>选手</th><th>正确</th><th>用时</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="v3-muted">还没有成绩。</p>';
      if (!finished) $('result-body').innerHTML += '<p class="v3-muted" style="margin-top:10px">对手完成后刷新这里就能看到最终胜负。</p>';
    } catch (err) { V3.fail(err); }
  }

  $('create-duel').addEventListener('click', async function () {
    try {
      var res = await V3.api('/api/v3/duels', { method: 'POST', body: { subject: $('duel-subject').value } });
      V3.toast('对局已创建，邀请码 ' + res.code);
      openDuel(res.id);
    } catch (err) { V3.fail(err); }
  });
  $('join-duel').addEventListener('click', async function () {
    var code = $('join-code').value.trim().toUpperCase();
    if (!code) { V3.toast('请输入邀请码', 'error'); return; }
    try {
      var res = await V3.api('/api/v3/duels/join', { method: 'POST', body: { code: code } });
      openDuel(res.id);
    } catch (err) { V3.fail(err); }
  });
  $('play-submit').addEventListener('click', submitAnswer);
  $('play-answer').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') submitAnswer(); });
  $('play-finish').addEventListener('click', finish);
  $('result-back').addEventListener('click', function () { show('view-home'); loadHome(); });

  (async function () {
    try { await V3.boot(); subjectSelect(); loadHome(); } catch (err) { V3.fail(err); }
  })();
})();
