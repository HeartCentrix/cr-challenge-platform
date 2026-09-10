/* Challenge Platform - public page logic.
 *
 * Everything the mockup faked is real here: the question, the editor, the
 * countdown, running against samples, scoring, the leaderboard and the ticker.
 * The visual language is untouched; only the wiring is new.
 */
function bootstrapChallenge() {
  'use strict';

  var API = window.__CHALLENGE_API_BASE__ || '/api/v1';

  var portal = document.getElementById('challengePortal');
  var el = function (id) { return portal.querySelector('#' + id); };
  var disposed = false;
  var requests = new AbortController();
  var timerId = null;
  var releaseBadge = function () {};

  var state = {
    question: null,
    editor: null,
    startedAt: null,      // set on the first keystroke, not on page load
    secondsLeft: null,
    ticking: false,
    timeUp: false,
    submitted: false,
    submitting: false
  };

  // ------------------------------------------------------------------ util
  function fmtClock(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function api(path, options) {
    return fetch(API + path, Object.assign({}, options, { signal: requests.signal })).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { status: res.status, ok: res.ok, body: body };
      });
    });
  }

  function elapsedMs() {
    return state.startedAt ? Date.now() - state.startedAt : 0;
  }

  // ---------------------------------------------------------------- timer
  function stopClock() {
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
    state.ticking = false;
  }

  function renderTimer() {
    var t = el('timer');
    if (!t || state.secondsLeft === null) return;
    t.textContent = fmtClock(Math.max(0, state.secondsLeft));
    t.classList.toggle('low', state.secondsLeft <= 60);
  }

  function startClock() {
    if (state.ticking || state.timeUp || state.submitted || disposed) return;
    state.ticking = true;
    state.startedAt = Date.now();
    var hint = el('editorHint');
    if (hint) hint.textContent = 'clock running';
    timerId = setInterval(function () {
      if (!state.submitted && state.secondsLeft > 0) {
        state.secondsLeft--;
        renderTimer();
        if (state.secondsLeft === 0) timeUp();
      }
    }, 1000);
  }

  function timeUp() {
    stopClock();
    state.timeUp = true;
    var host = el('editorHost');
    if (host) host.classList.add('locked');
    if (state.editor) state.editor.updateOptions({ readOnly: true });
    var hint = el('editorHint');
    if (hint) hint.textContent = 'time is up - submit your answer';
  }

  // ------------------------------------------------------------- question
  function loadQuestion() {
    var wanted = new URLSearchParams(location.search).get('q');
    function randomQuestion() {
      return api('/questions', { cache: 'no-store' });
    }
    var request = wanted
      ? api('/questions/' + encodeURIComponent(wanted)).then(function (r) {
          return r.status === 404 ? randomQuestion() : r;
        })
      : randomQuestion();
    return request.then(function (r) {
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
      'One problem. ' + Math.round(q.timeLimitSeconds / 60) + ' minutes. Show us how you solve it.';

    state.secondsLeft = q.timeLimitSeconds;
    renderTimer();

    var select = el('sampleSelect');
    select.innerHTML = '';
    (q.samples || []).forEach(function (s, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      var preview = (s.stdin || '').replace(/\n/g, ' · ').slice(0, 46);
      opt.textContent = 'Test Case ' + (i + 1) + ': ' + preview + '  ->  ' + s.expectedOutput.slice(0, 24);
      select.appendChild(opt);
    });
    if (!(q.samples || []).length) {
      var none = document.createElement('option');
      none.textContent = 'no test cases';
      select.appendChild(none);
      el('runBtn').disabled = true;
    }
  }

  // --------------------------------------------------------------- editor
  function initEditor(starterCode) {
    if (disposed) return;
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
      if (disposed) return;
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
    var success = el('modalPass');
    var reveal = el('revealBtn');
    var formStatus = el('formStatus');
    var currentPanel = form;

    function show(which) {
      currentPanel = which;
      [form, result, success].forEach(function (n) {
        if (n) {
          n.classList.toggle('open', n === which);
          n.hidden = n !== which;
        }
      });
    }

    function openModal() {
      show(currentPanel);
      overlay.classList.add('open');
      el('modalClose').focus();
    }

    function closeModal() {
      overlay.classList.remove('open');
      el('submitBtn').focus();
    }

    el('submitBtn').addEventListener('click', function (e) { e.preventDefault(); openModal(); });
    el('modalClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab') {
        var focusable = Array.from(overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]'))
          .filter(function (node) { return node.getClientRects().length; });
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    function fieldsOk() {
      return el('firstNameInput').value.trim() && el('lastNameInput').value.trim()
        && el('emailInput').value.trim() && el('phoneInput').value.trim()
        && ['firstNameInput', 'lastNameInput', 'emailInput', 'phoneInput'].every(function (id) {
          return el(id).checkValidity();
        });
    }

    function refresh() {
      var valid = fieldsOk();
      reveal.disabled = state.submitting || !valid;
      reveal.textContent = valid ? 'Submit answer' : 'Enter your details';
    }
    ['firstNameInput', 'lastNameInput', 'emailInput', 'phoneInput']
      .forEach(function (id) {
        el(id).addEventListener('input', refresh);
        el(id).addEventListener('change', refresh);
      });
    show(form);
    refresh();

    el('badgeLogo').src = portal.querySelector('.logo-img').src;
    // Share only the public challenge URL, never candidate details or local API URLs.
    var shareUrl = new URL('https://challenge.dev.codereport.com/');
    var badgeUrl;
    releaseBadge = function () {
      if (badgeUrl) URL.revokeObjectURL(badgeUrl);
      badgeUrl = null;
    };
    el('shareBtn').addEventListener('click', function () {
      if (!state.submitted) return;
      shareUrl.searchParams.set('q', state.question.slug);
      var linkedInUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(shareUrl.href);
      el('linkedInShare').href = linkedInUrl;
      el('shareActions').hidden = false;
      // Open during the click event so popup blockers do not reject an async open.
      window.open(linkedInUrl, '_blank', 'noopener,noreferrer');
      if (badgeUrl) {
        el('downloadBadge').click();
        return;
      }
      el('shareBtn').disabled = true;
      el('shareStatus').textContent = 'Preparing your badge...';
      Promise.resolve().then(function () {
        return window.__CHALLENGE_CAPTURE_BADGE__(el('badgeCard'));
      }).then(function (canvas) {
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('Badge image unavailable'));
          }, 'image/png');
        });
      }).then(function (blob) {
        if (disposed) return;
        badgeUrl = URL.createObjectURL(blob);
        el('downloadBadge').href = badgeUrl;
        el('downloadBadge').hidden = false;
        el('downloadBadge').click();
        el('shareStatus').textContent = 'Attach the downloaded badge to your LinkedIn post. If LinkedIn did not open, use the link below.';
      }).catch(function () {
        el('shareStatus').textContent = 'Could not create the badge image. Try again, or use Open LinkedIn to share the challenge link.';
      }).finally(function () {
        el('shareBtn').disabled = false;
      });
    });
    window.addEventListener('pagehide', function (event) {
      if (!event.persisted) releaseBadge();
    }, { signal: requests.signal });

    function submissionError(message) {
      state.submitting = false;
      formStatus.textContent = message;
      show(form);
      refresh();
    }

    reveal.addEventListener('click', function () {
      if (state.submitting || state.submitted || !fieldsOk()) return;
      if (!state.question || !state.editor || !sourceCode().trim()) {
        formStatus.textContent = 'Wait for the problem to load and enter your code before submitting.';
        return;
      }
      state.submitting = true;
      // Use the exact duration sent to the database; exclude the grading wait.
      var submittedDurationMs = elapsedMs();
      formStatus.textContent = '';
      refresh();
      show(result);
      el('resultStatus').textContent = 'Submitting your answer...';

      api('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: state.question.slug,
          sourceCode: sourceCode(),
          fullName: el('firstNameInput').value.trim() + ' ' + el('lastNameInput').value.trim(),
          email: el('emailInput').value.trim(),
          phone: el('phoneInput').value.trim(),
          consent: false,
          durationMs: submittedDurationMs,
          sourceCampaign: new URLSearchParams(location.search).get('c') || 'direct'
        })
      }).then(function (r) {
        if (r.status === 429) {
          submissionError('You have already submitted today. Come back tomorrow.');
          return;
        }
        if (!r.ok) {
          submissionError('We could not save your submission. Please check your details and try again.');
          return;
        }
        state.submitted = true;
        stopClock();
        state.submitting = false;
        state.editor.updateOptions({ readOnly: true });
        el('editorHint').textContent = 'submission saved';
        el('badgeTime').textContent = fmtClock(Math.floor(submittedDurationMs / 1000));
        show(success);
        loadLeaderboard();
        loadStats();
      }).catch(function () {
        submissionError('We could not confirm your submission. Please try again in a moment.');
      });
    });
  }

  // ---------------------------------------------------------- leaderboard
  function leaderboardName(name) {
    var parts = String(name || '').trim().split(/\s+/u).filter(Boolean);
    if (!parts.length) return 'Anonymous';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + Array.from(parts[parts.length - 1])[0].toUpperCase() + '.';
  }

  function loadLeaderboard() {
    api('/leaderboard?limit=5').then(function (r) {
      var host = el('leaderboardRows');
      if (!host || !r.ok) return;
      host.innerHTML = '';
      if (!r.body.length) {
        host.innerHTML = '<div class="board-empty">No solves yet. Be the first.</div>';
        return;
      }
      r.body.forEach(function (row) {
        var div = document.createElement('div');
        div.className = 'board-row';
        div.innerHTML =
          '<span class="board-rank"></span>'
          + '<span class="board-name"></span>';
        div.querySelector('.board-rank').textContent = String(row.rank).padStart(2, '0');
        div.querySelector('.board-name').textContent = leaderboardName(row.displayName);
        host.appendChild(div);
      });
    }).catch(function () { /* panel simply stays empty */ });
  }

  function loadStats() {
    api('/stats').then(function (r) {
      if (!r.ok) return;
      var t = el('ticker');
      var count = Number(r.body.attempts || 0);
      if (t) t.textContent = count.toLocaleString();
      var label = portal.querySelector('.ticker-label');
      if (label) label.textContent = 'submissions so far';
      var block = portal.querySelector('.ticker-block');
      if (block) block.style.display = count > 100 ? '' : 'none';
    }).catch(function () { /* ticker stays as-is */ });
  }

  // ------------------------------------------------------------------ init
  function init() {
    el('runBtn').addEventListener('click', runSample);
    wireModal();
    loadLeaderboard();
    loadStats();

    loadQuestion().then(function (q) {
      initEditor(q.starterCode);
    }).catch(function () {
      el('problemTitle').textContent = 'Could not load the problem';
      el('problemPrompt').textContent = 'We could not load the problem. Please refresh the page and try again.';
    });
  }
  init();
  return function cleanupChallenge() {
    disposed = true;
    stopClock();
    requests.abort();
    releaseBadge();
    if (state.editor) {
      var model = state.editor.getModel();
      state.editor.dispose();
      if (model) model.dispose();
    }
  };
}
