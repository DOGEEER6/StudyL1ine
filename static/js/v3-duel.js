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
        V3.math($('result-body'));
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
    V3.math($('play-problem'));
    $('play-answer').value = '';
    $('play-feedback').textContent = '';
    $('play-photo-hint').textContent = '纸上写完拍照，AI 对照片判分，结果交卷后一起出';
    $('play-progress').innerHTML = duel.questions.map(function (item, i) {
      var cls = i === state.index ? 'now' : '';
      if (duel.mine.answers[i]) cls = 'done';
      return '<i class="' + cls + '"></i>';
    }).join('');
    state.startedAt = Date.now();
    clearInterval(state.timer);
    state.timer = setInterval(function () {
      $('play-timer').textContent = ((Date.now() - state.startedAt) / 1000).toFixed(1) + 's';
    }, 100);
    $('play-answer').focus();
  }

  function noteAnswered(idx, done) {
    var duel = state.duel;
    duel.mine.answers[idx] = { answered: true, seconds: (Date.now() - state.startedAt) / 1000 };
    $('play-feedback').textContent = '第 ' + (idx + 1) + ' 题已记录（' + done + ' / ' + duel.total + '），对错交卷后统一公布';
    state.index += 1;
    setTimeout(renderQuestion, 420);
  }

  async function submitAnswer() {
    var duel = state.duel;
    var text = $('play-answer').value.trim();
    if (!text) { V3.toast('先写答案，或者拍一张手写解答', 'error'); return; }
    var seconds = (Date.now() - state.startedAt) / 1000;
    try {
      var res = await V3.api('/api/v3/duels/' + duel.id + '/answer', {
        method: 'POST', body: { idx: state.index, text: text, seconds: seconds }
      });
      noteAnswered(state.index, res.answered);
    } catch (err) { V3.fail(err); }
  }

  function compressImage(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.onerror = function () { reject(new Error('图片读不出来')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('图片读不出来')); };
      reader.readAsDataURL(file);
    });
  }

  async function submitPhoto(file) {
    var duel = state.duel;
    if (!file) return;
    $('play-photo-hint').textContent = '正在压缩图片…';
    var seconds = (Date.now() - state.startedAt) / 1000;
    try {
      var dataUrl = await compressImage(file, 1500);
      $('play-photo-hint').textContent = 'AI 正在看你的手写解答…';
      var res = await V3.api('/api/v3/duels/' + duel.id + '/answer', {
        method: 'POST', body: { idx: state.index, image: dataUrl, seconds: seconds }
      });
      noteAnswered(state.index, res.answered);
    } catch (err) {
      $('play-photo-hint').textContent = '上传失败：' + err.message;
      V3.fail(err);
    }
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
      if (!finished) $('result-body').innerHTML += '<p class="v3-muted" style="margin-top:10px">对手完成后刷新这里就能看到最终胜负和每题解析。</p>';
      $('result-questions').innerHTML = '';
      $('result-analysis').innerHTML = '';
      if (finished && (data.questions || []).length) {
        renderQuestions(data.questions);
        var btn = document.createElement('button');
        btn.className = 'v3-btn';
        btn.type = 'button';
        btn.textContent = 'AI 讲解这次错的题';
        btn.style.marginTop = '12px';
        btn.addEventListener('click', function () { loadAnalysis(id, btn); });
        $('result-analysis').appendChild(btn);
        if ((data.analysis || []).length) renderAnalysis(data.analysis);
      }
      V3.math($('result-body'));
    } catch (err) { V3.fail(err); }
  }

  function renderQuestions(list) {
    var html = '<h3 style="font-size:15px;margin:16px 0 8px">逐题核对</h3><div class="duel-review">';
    list.forEach(function (q) {
      html += '<div class="duel-review-item">' +
        '<div class="duel-review-head"><span class="duel-badge ' + (q.verdict === 'AC' ? 'ac' : 'wa') + '">' +
        (q.verdict === 'AC' ? 'AC' : q.verdict === 'WA' ? 'WA' : '未答') + '</span>' +
        '<strong>' + V3.esc(q.title) + '</strong>' +
        '<span class="v3-muted">' + q.seconds + 's</span></div>' +
        '<div class="duel-review-body">' + (q.verdict === 'AC' ? '' :
          '<p><span class="v3-muted">你的答案：</span>' +
          (q.your_image ? '<a href="' + V3.esc(q.your_image) + '" target="_blank">手写解答</a>' : V3.esc(q.your_text || '（没答）')) + '</p>') +
        (q.verdict === 'AC' ? '' : (q.correct_answer ? '<p><span class="v3-muted">参考答案：</span>' + V3.esc(q.correct_answer) + '</p>' : '')) +
        (q.reason ? '<p class="v3-muted">' + V3.esc(q.reason) + '</p>' : '') +
        '</div></div>';
    });
    html += '</div>';
    $('result-questions').innerHTML = html;
  }

  function renderAnalysis(items) {
    var html = '<h3 style="font-size:15px;margin:18px 0 8px">错题解析</h3><div class="duel-analysis">';
    items.forEach(function (it) {
      html += '<div class="duel-analysis-item"><p style="margin:0 0 4px"><strong>考点：</strong>' + V3.esc(it.point) + '</p>' +
        '<p style="margin:0 0 4px"><strong>可能错在：</strong>' + V3.esc(it.why) + '</p>' +
        '<p style="margin:0"><strong>正确思路：</strong>' + V3.esc(it.how) + '</p></div>';
    });
    html += '</div>';
    $('result-analysis').innerHTML = html;
  }

  async function loadAnalysis(id, btn) {
    btn.disabled = true;
    btn.textContent = 'AI 正在整理解析…';
    try {
      var res = await V3.api('/api/v3/duels/' + id + '/analysis', { method: 'POST', body: {} });
      if (!(res.analysis || []).length) {
        btn.textContent = '这次没有错题，不需要解析';
        return;
      }
      renderAnalysis(res.analysis);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'AI 讲解这次错的题';
      V3.fail(err);
    }
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
  $('play-photo').addEventListener('change', function () {
    submitPhoto(this.files && this.files[0]);
    this.value = '';
  });
  $('play-finish').addEventListener('click', finish);
  $('result-back').addEventListener('click', function () { show('view-home'); loadHome(); });

  (async function () {
    try { await V3.boot(); subjectSelect(); loadHome(); } catch (err) { V3.fail(err); }
  })();
})();
