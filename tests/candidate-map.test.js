// Run: node --test tests/candidate-map.test.js (no browser/dependencies required).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const node = () => ({ children: [], attrs: {}, textContent: '', appendChild(n) { this.children.push(n); },
    replaceChildren() { this.children = []; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const svg = node();
  const context = {window:{}, document:{ getElementById: id => id === 'usaMap' ? svg : null, createElementNS: node }};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/map.js'), 'utf8'), context);
  const dots = () => svg.children.find(n => n.attrs.class === 'candidate-map-dots').children;
  return { render: context.window.buildChallengeMap, svg, dots, context };
}
test('no decorative dots when loading, empty or unavailable; no accumulation across renders', () => {
  const map = setup();
  for (const data of [undefined, {status:'ready',points:[]}, {status:'unavailable',points:[]}]) {
    map.render(data); assert.equal(map.dots().length, 0); assert.equal(map.svg.children.length, 3);
  }
});
test('projects real US locations onto land and merges colocated candidate counts', () => {
  const map = setup();
  map.render({status:'ready',points:[{latitude:40.5,longitude:-74,candidates:2},{latitude:40.5,longitude:-74,candidates:3},
    {latitude:32.5,longitude:-97,candidates:1},{latitude:-33,longitude:151,candidates:50}, {latitude:NaN,longitude:0,candidates:2}]});
  assert.equal(map.dots().length, 2);
  assert.equal(map.dots()[0].children[0].textContent, '5 candidates in this approximate area');
  assert.match(map.svg.attrs['aria-label'], /6 candidates shown/);
  map.render({status:'ready',points:[]}); assert.equal(map.dots().length, 0);
});
test('projection aligns with the existing city geometry', () => {
  const map = setup();
  const nyc = vm.runInContext('projectCandidateLocation(40.7128, -74.006)', map.context);
  assert.ok(Math.abs(nyc[0]-828.3)<1 && Math.abs(nyc[1]-194.7)<1);
  const seattle = vm.runInContext('projectCandidateLocation(47.6062, -122.3321)', map.context);
  assert.ok(Math.abs(seattle[0]-59.7)<1 && Math.abs(seattle[1]-55.6)<1);
});
