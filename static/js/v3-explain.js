/* v3-explain.js — extracted from templates/explain.html (CSP blocks inline scripts). */
(function () {
  var entryId = document.body.dataset.entryId || "";
  var sessionId = '';
  var busy = false;
  var $ = function (id) { return document.getElementById(id); };

  function bubble(role, text) {
    var el = document.createElement('div');
    el.className = 'msg ' + role;
    var who = role === 'assistant' ? 'AI 学生' : '你';
    el.innerHTML = '<span class="who">' + who + '</span><span class="body">' + V3.esc(text) + '</span>';
    $('chat').appendChild(el);
    V3.math(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setTurns(n) {
    $('turn-chip').textContent = '第 ' + n + ' / 5 轮';
  }

  function lock(on) {
    busy = on;
    $('say-send').disabled = on;
    $('say-input').disabled = on;
  }

  async function send() {
    if (busy) return;
    var text = $('say-input').value.trim();
    if (!text) return;
    bubble('user', text);
    $('say-input').value = '';
    lock(true);
    try {
      var res = await V3.api('/api/v3/explain/' + sessionId + '/message', { method: 'POST', body: { content: text } });
      bubble('assistant', res.reply);
      setTurns(res.turns);
      if (res.finished && res.evaluation) showEval(res.evaluation);
    } catch (err) {
      V3.fail(err);
    } finally {
      lock(false);
      $('say-input').focus();
    }
  }

  function showEval(ev) {
    $('eval-card').hidden = false;
    $('eval-score').textContent = ev.score + ' 分';
    $('eval-verdict').textContent = ev.verdict || '';
    $('eval-weak').innerHTML = (ev.weak_points && ev.weak_points.length)
      ? '<p class="v3-muted" style="margin:0 0 4px">没讲清楚的地方</p><ul>' +
        ev.weak_points.map(function (w) { return '<li>' + V3.esc(w) + '</li>'; }).join('') + '</ul>'
      : '<p class="v3-muted">没有明显漏洞，讲得挺完整。</p>';
    $('eval-next').textContent = ev.next_step ? '下一步：' + ev.next_step : '';
    $('say-input').disabled = true;
    $('say-send').disabled = true;
    $('eval-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function loadEntry() {
    try {
      var data = await V3.api('/api/entries/' + entryId);
      var entry = data.entry || data;
      $('entry-card').hidden = false;
      $('entry-problem').textContent = entry.problem || entry.title || '';
      V3.math($('entry-problem'));
    } catch (err) { /* 不影响讲解 */ }
  }

  async function start() {
    lock(true);
    try {
      var res = await V3.api('/api/v3/explain/start', { method: 'POST', body: { entry_id: entryId } });
      sessionId = res.id;
      if (res.resumed) {
        var data = await V3.api('/api/v3/explain/' + sessionId);
        data.messages.forEach(function (m) { bubble(m.role, m.content); });
        setTurns(data.session.turns);
        if (data.session.done) {
          showEval({ score: data.session.score, verdict: data.session.verdict, weak_points: data.session.weak_points });
          return;
        }
      } else {
        bubble('assistant', res.message);
        setTurns(0);
      }
      lock(false);
      $('say-input').focus();
    } catch (err) {
      V3.fail(err);
      lock(false);
    }
  }

  $('say-send').addEventListener('click', send);
  $('say-input').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') send(); });
  $('eval-again').addEventListener('click', function () { location.reload(); });

  (async function () {
    try {
      await V3.boot();
      loadEntry();
      start();
    } catch (err) { V3.fail(err); }
  })();
})();
