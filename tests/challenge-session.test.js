// Run with node --test tests/*.test.js; no browser or database writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup(saved = null) {
  const nodes = new Map(), calls = [], timers = new Map();
  let now = 0, timerId = 0, server = saved, stored = saved ? 'session-token' : null;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set(), listeners = {};
    const value = { textContent: '', value: '', hidden: false, disabled: false, src: '/logo.png',
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) },
      addEventListener: (name, action) => { listeners[name] = action; },
      click: () => listeners.click?.({ preventDefault() {} }),
      focus() {}, checkValidity: () => true, appendChild() {}, getClientRects: () => [1],
      querySelector: selector => node(selector), querySelectorAll: () => [],
    };
    nodes.set(id, value); return value;
  }
  const portal = node('challengePortal'); portal.querySelector = selector => node(selector.replace(/^#/, ''));
  const editor = { code: '', readonly: true, getValue() { return this.code; }, setValue(v) { this.code = v; },
    updateOptions(v) { this.readonly = v.readOnly; }, getModel: () => ({ dispose() {} }), dispose() {} };
  function question(n) { return { id: n, slug: 'q'+n, title: 'Question '+n, prompt: 'Prompt', difficulty: 5,
    starterCode: 'starter', samples: [{ stdin: '1', expectedOutput: '1' }], timeLimitSeconds: 15 }; }
  const stamp = ms => new Date(1700000000000 + ms).toISOString();
  const requireMonaco = (_modules, ready) => ready(); requireMonaco.config = () => {};
  class ClockDate extends Date { static now() { return 1700000000000 + now; } }
  const context = { console, URL, URLSearchParams, AbortController, Date: ClockDate, performance: { now: () => now },
    crypto: { randomUUID: () => 'session-token' }, location: { search: '' },
    localStorage: { getItem: () => stored, setItem: (_k,v) => { stored = v; }, removeItem: () => { stored = null; } },
    setInterval: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearInterval: id => timers.delete(id), setTimeout, clearTimeout,
    require: requireMonaco, monaco: { editor: { defineTheme() {}, create: () => editor } },
    window: { addEventListener() {}, buildChallengeMap() {} },
    document: { getElementById: () => portal, createElement: () => node('option') },
    fetch: async (url, options) => {
      const name = url.split('/').pop(); calls.push(name);
      const body = options?.body ? JSON.parse(options.body) : {};
      let response = {};
      if (name.startsWith('leaderboard')) response = [];
      else if (name === 'stats') response = { attempts: 0 };
      else {
        if (name === 'start') server = { status: 'ACTIVE', startedAt: stamp(now), expiresAt: stamp(now + 600000),
          ordinal: 1, submittedAnswers: 0, question: question(1), draftCode: null, draftRevision: 0 };
        if (name === 'answer') server = { ...server, ordinal: 2, submittedAnswers: 1, question: question(2), draftCode: null };
        if (name === 'draft') { server.draftCode = body.sourceCode; server.draftRevision = body.revision; }
        if (name === 'finish') server = { ...server, status: 'FINISHED', reason: 'TIME_UP', finishedAt: server.expiresAt, question: null };
        response = { ...server, serverNow: stamp(now) };
      }
      return { ok: true, status: 200, json: async () => response };
    },
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'), context);
  const tracking = [];
  const cleanup = context.bootstrapChallenge((_portal, _editor, slug, binding) => {
    tracking.push({ slug, binding });
    return { dispose() {}, snapshot: () => ({ questionSlug: slug, events: [] }) };
  });
  return { nodes, calls, editor, tracking, cleanup, get server() { return server; },
    async start() { for (const id of ['firstNameInput','lastNameInput','emailInput','phoneInput']) node(id).value = 'test'; node('revealBtn').click(); await settle(); },
    async advance(ms) { now += ms; for (const timer of [...timers.values()]) timer.fn(); await settle(); },
  };
}

test('one ten-minute clock survives the next question; idle drafts make no requests', async () => {
  const app = setup(); await app.start();
  assert.equal(app.nodes.get('timer').textContent, '10:00'); // Ignore the old per-question 15 seconds.
  const deadline = app.server.expiresAt;
  await app.advance(60000);
  assert.equal(app.nodes.get('timer').textContent, '9:00');
  assert.equal(app.calls.filter(c => c === 'draft').length, 0);
  app.editor.code = 'answer one'; app.nodes.get('submitBtn').click(); await settle();
  assert.equal(app.server.expiresAt, deadline);
  assert.equal(app.server.ordinal, 2);
  await app.advance(60000);
  assert.equal(app.nodes.get('timer').textContent, '8:00');
  assert.deepEqual(app.tracking.map(t => t.binding.ordinal), [1,2]);
  assert.equal(app.calls.filter(c => c === 'questions').length, 0);
  app.cleanup();
});

test('changed draft resumes and expiry locks input and shows time, never a score', async () => {
  const app = setup(); await app.start();
  app.editor.code = 'saved draft'; await app.advance(5000);
  assert.equal(app.server.draftCode, 'saved draft');
  app.cleanup();
  const resumed = setup(app.server); await settle();
  assert.equal(resumed.editor.code, 'saved draft');
  await resumed.advance(610000);
  assert.equal(resumed.editor.readonly, true);
  assert.equal(resumed.nodes.get('timer').textContent, '0:00');
  assert.equal(resumed.nodes.get('badgeTime').textContent, '10:00');
  assert.match(resumed.nodes.get('completionCopy').textContent, /answers saved/);
  assert.equal(resumed.calls.filter(c => c === 'finish').length, 1);
  resumed.cleanup();
});
