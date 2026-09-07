/* Challenge Platform - public page logic.
 *
 * Everything the mockup faked is real here: the question, the editor, the
 * countdown, running against samples, scoring, the leaderboard and the ticker.
 * The visual language is untouched; only the wiring is new.
 */
(function () {
  'use strict';

  var API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:8090/api/v1'
    : '/api/v1';

  var el = function (id) { return document.getElementById(id); };

  var state = {
    question: null,
    editor: null,
    startedAt: null,      // set on the first keystroke, not on page load
    secondsLeft: null,
    ticking: false,
    timeUp: false,
    submitted: false
  };

  // ------------------------------------------------------------------ util
  function fmtClock(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function api(path, options) {
    return fetch(API + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { status: res.status, ok: res.ok, body: body };
      });
    });
  }

  function elapsedMs() {
    return state.startedAt ? Date.now() - state.startedAt : 0;
  }

  // ---------------------------------------------------------------- timer
  function renderTimer() {
    var t = el('timer');
    if (!t || state.secondsLeft === null) return;
    t.textContent = fmtClock(Math.max(0, state.secondsLeft));
    t.classList.toggle('low', state.secondsLeft <= 60);
  }

  function startClock() {
    if (state.ticking || state.timeUp) return;
    state.ticking = true;
    state.startedAt = Date.now();
    var hint = el('editorHint');
    if (hint) hint.textContent = 'clock running';
    setInterval(function () {
      if (state.secondsLeft > 0) {
        state.secondsLeft--;
        renderTimer();
        if (state.secondsLeft === 0) timeUp();
      }
    }, 1000);
  }

  function timeUp() {
    state.timeUp = true;
    var host = el('editorHost');
    if (host) host.classList.add('locked');
    if (state.editor) state.editor.updateOptions({ readOnly: true });
    var hint = el('editorHint');
    if (hint) hint.textContent = "time is up - submit to see your score";
  }

  // ------------------------------------------------------------- question
  function loadQuestion() {
    var wanted = new URLSearchParams(location.search).get('q');
    return api('/questions').then(function (r) {
      if (!r.ok || !r.body.length) throw new Error('no active questions');
      var chosen = wanted
        ? (r.body.filter(function (q) { return q.slug === wanted; })[0] || r.body[0])
        : r.body[0];
      return api('/questions/' + chosen.slug);
    }).then(function (r) {
      if (!r.ok) throw new Error('question not found');
      state.question = r.body;
      renderQuestion();
      return r.body;
    });
  }

  function renderQuestion() {
    var q = state.question;
    el('problemTitle').textContent = q.title;
    el('problemDifficulty').textContent = 'difficulty ' + q.difficulty + '/10';
    el('problemPrompt').textContent = q.prompt;
    el('problemMeta').textContent =
      'One problem. ' + Math.round(q.timeLimitSeconds / 60) + ' minutes. Scored exactly the way we '
      + 'evaluate every candidate in our network.';

    state.secondsLeft = q.timeLimitSeconds;
    renderTimer();

    var select = el('sampleSelect');
    select.innerHTML = '';
    (q.samples || []).forEach(function (s, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      var preview = (s.stdin || '').replace(/\n/g, ' · ').slice(0, 46);
      opt.textContent = 'Sample ' + (i + 1) + ': ' + preview + '  ->  ' + s.expectedOutput.slice(0, 24);
      select.appendChild(opt);
    });
    if (!(q.samples || []).length) {
      var none = document.createElement('option');
      none.textContent = 'no sample inputs';
      select.appendChild(none);
      el('runBtn').disabled = true;
    }
  }

  // --------------------------------------------------------------- editor
  function initEditor(starterCode) {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
      monaco.editor.defineTheme('codereport', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '5A5A5A', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'E44C3D' },
          { token: 'type', foreground: 'EDEDED' },
          { token: 'string', foreground: '9AA97F' }
        ],
        colors: {
          'editor.background': '#0A0A0A',
          'editor.lineHighlightBackground': '#141414',
          'editorLineNumber.foreground': '#3A3A3A',
          'editorGutter.background': '#0A0A0A'
        }
      });
      state.editor = monaco.editor.create(el('editorHost'), {
        value: starterCode || '',
        language: 'java',
        theme: 'codereport',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,          // never mix tabs and spaces into a submission
        renderWhitespace: 'none'
      });
      // The clock starts on the first keystroke, exactly as the design intends.
      state.editor.onDidChangeModelContent(startClock);
    });
  }

  function sourceCode() {
    return state.editor ? state.editor.getValue() : '';
  }

  // ------------------------------------------------------------------ run
  function runSample() {
    var q = state.question;
    var idx = parseInt(el('sampleSelect').value, 10) || 0;
    var sample = (q.samples || [])[idx];
    if (!sample) return;

    var btn = el('runBtn');
    var status = el('runStatus');
    var out = el('runOutput');
    btn.disabled = true;
    status.className = 'run-status';
    status.textContent = 'running...';

    api('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: q.slug, sourceCode: sourceCode(), stdin: sample.stdin })
    }).then(function (r) {
      btn.disabled = false;
      var body = r.body || {};
      var got = (body.stdout || '').replace(/\s+$/, '');
      var want = (sample.expectedOutput || '').replace(/\s+$/, '');
      var matched = body.status === 'Accepted' && got === want;
      status.className = 'run-status ' + (matched ? 'ok' : 'bad');
      status.textContent = matched ? 'matches expected output' : (body.status || 'no result');
      out.hidden = false;
      out.textContent =
        'stdin:\n' + (sample.stdin || '(empty)') +
        '\n\nexpected:\n' + want +
        '\n\nyour output:\n' + (got || '(nothing)') +
        (body.stderr ? '\n\nstderr:\n' + body.stderr : '');
    }).catch(function () {
      btn.disabled = false;
      status.className = 'run-status bad';
      status.textContent = 'could not reach the judge';
    });
  }

  // --------------------------------------------------------------- submit
  function wireModal() {
    var overlay = el('modalOverlay');
    var form = el('modalForm');
    var result = el('modalResult');
    var fail = el('modalFail');
    var pass = el('modalPass');
    var reveal = el('revealBtn');

    function show(which) {
      [form, result, fail, pass].forEach(function (n) { if (n) n.classList.remove('active'); });
      if (which) which.classList.add('active');
    }

    function openModal() {
      if (state.submitted) { show(pass && pass.classList.contains('done') ? pass : fail); }
      else { show(form); }
      overlay.classList.add('active');
    }

    function closeModal() { overlay.classList.remove('active'); }

    el('submitBtn').addEventListener('click', function (e) { e.preventDefault(); openModal(); });
    el('modalClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    function fieldsOk() {
      return el('firstNameInput').value.trim() && el('lastNameInput').value.trim()
        && el('emailInput').value.trim() && el('phoneInput').value.trim()
        && el('consentInput').checked;
    }

    function refresh() {
      reveal.disabled = !fieldsOk();
      reveal.textContent = fieldsOk() ? 'See my score' : 'Enter your details';
    }
    ['firstNameInput', 'lastNameInput', 'emailInput', 'phoneInput', 'consentInput']
      .forEach(function (id) {
        el(id).addEventListener('input', refresh);
        el(id).addEventListener('change', refresh);
      });
    refresh();

    reveal.addEventListener('click', function () {
      if (!fieldsOk()) return;
      show(result);
      el('resultStatus').textContent = 'Scoring your submission against ' +
        (state.question.samples ? 'every test case' : 'the test cases') + '...';

      api('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: state.question.slug,
          sourceCode: sourceCode(),
          fullName: el('firstNameInput').value.trim() + ' ' + el('lastNameInput').value.trim(),
          email: el('emailInput').value.trim(),
          phone: el('phoneInput').value.trim(),
          consent: true,
          durationMs: elapsedMs(),
          sourceCampaign: new URLSearchParams(location.search).get('c') || 'direct'
        })
      }).then(function (r) {
        if (r.status === 429) {
          el('resultStatus').innerHTML = 'You have already submitted today.'
            + '<div class="notice">One attempt per person per day. Come back tomorrow.</div>';
          return;
        }
        if (!r.ok) {
          el('resultStatus').innerHTML = 'We could not score that submission.'
            + '<div class="notice">' + (r.body.error || 'Please try again.') + '</div>';
          return;
        }
        state.submitted = true;
        renderScore(r.body, show, fail, pass);
      }).catch(function () {
        el('resultStatus').innerHTML = 'We could not reach the scoring service.'
          + '<div class="notice">Please try again in a moment.</div>';
      });
    });
  }

  function renderScore(res, show, fail, pass) {
    var perfect = res.testcasesPassed === res.testcasesTotal;
    var pct = res.testcasesTotal ? Math.round(100 * res.testcasesPassed / res.testcasesTotal) : 0;
    var clock = fmtClock(Math.round((res.durationMs || 0) / 1000));

    var detail = '<div class="result-detail">' + res.results.map(function (o) {
      return '<span class="' + (o.passed ? 'case-pass' : 'case-fail') + '">'
        + (o.passed ? 'PASS' : 'FAIL') + '</span>  test case ' + o.ordinal
        + (o.passed ? '' : '  (' + (o.status || 'failed') + ')');
    }).join('<br>') + '</div>';

    if (perfect) {
      el('badgeScore').textContent = Math.round(res.score);
      el('badgeTime').textContent = clock;
      var passCopy = pass.querySelector('.badge-sub');
      if (passCopy) passCopy.textContent = 'Verified Java Problem Solver';
      pass.classList.add('done');
      show(pass);
    } else {
      var num = fail.querySelector('.score-num');
      if (num) num.innerHTML = pct + '<span>/100</span>';
      var copy = fail.querySelector('.fail-copy');
      if (copy) {
        copy.innerHTML = 'Not in the top 5% this time - ' + res.testcasesPassed + ' of '
          + res.testcasesTotal + ' test cases passed in ' + clock + '. A new problem drops every Monday.'
          + detail;
      }
      show(fail);
    }
    loadLeaderboard();
    loadStats();
  }

  // ---------------------------------------------------------- leaderboard
  function loadLeaderboard() {
    api('/leaderboard?limit=5').then(function (r) {
      var host = el('leaderboardRows');
      if (!host || !r.ok) return;
      host.innerHTML = '';
      if (!r.body.length) {
        host.innerHTML = '<div class="board-empty">No solves yet. Be the first.</div>';
        return;
      }
      r.body.forEach(function (row, i) {
        var div = document.createElement('div');
        div.className = 'board-row';
        div.innerHTML =
          '<span class="board-rank">' + String(i + 1).padStart(2, '0') + '</span>'
          + '<span class="board-name"></span>'
          + '<span class="board-time">' + Math.round(row.totalScore) + '</span>'
          + (row.testcasesCleared ? '<span class="board-badge">' + row.testcasesCleared + ' cases</span>' : '');
        div.querySelector('.board-name').textContent = row.displayName;
        host.appendChild(div);
      });
    }).catch(function () { /* panel simply stays empty */ });
  }

  function loadStats() {
    api('/stats').then(function (r) {
      if (!r.ok) return;
      var t = el('ticker');
      if (t) t.textContent = Number(r.body.attempts || 0).toLocaleString();
      var label = document.querySelector('.ticker-label');
      if (label) label.textContent = 'submissions scored so far';
    }).catch(function () { /* ticker stays as-is */ });
  }

  // ------------------------------------------------------------------ init
  document.addEventListener('DOMContentLoaded', function () {
    el('runBtn').addEventListener('click', runSample);
    wireModal();
    loadLeaderboard();
    loadStats();

    loadQuestion().then(function (q) {
      initEditor(q.starterCode);
    }).catch(function () {
      el('problemTitle').textContent = 'Could not load the problem';
      el('problemPrompt').textContent =
        'The API at ' + API + ' is not responding.\n\nStart the backend with:\n'
        + '  cd backend && mvn spring-boot:run';
    });
  });
})();
