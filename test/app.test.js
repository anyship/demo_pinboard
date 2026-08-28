import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker, { parseCookies, sessionToken } from '../src/worker.js';

function extractInlineScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  return match ? match[1] : '';
}

const SEEDED_PINS = [
  'Launch checklist',
  'Brand color palette',
  'Weekly standup notes',
  'API design doc',
  'Coffee chat schedule',
  'Q3 roadmap draft',
  'Team offsite ideas',
  'Design review feedback',
];

test('unauthenticated GET / returns HTML with seeded pin content', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const html = await r.text();
  let found = 0;
  for (const pin of SEEDED_PINS) {
    if (html.includes(pin)) found++;
  }
  assert.ok(found >= 6, `Expected at least 6 seeded pins in HTML, found ${found}`);
});

test('unauthenticated GET / contains a sign-in affordance that is not the only content', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  const hasSignIn = /sign\s*in|log\s*in|google/i.test(html);
  assert.ok(hasSignIn, 'Page should contain a sign-in affordance');
  const hasCards = SEEDED_PINS.some(pin => html.includes(pin));
  assert.ok(hasCards, 'Page should have pin content beyond just sign-in');
});

test('inline script in served HTML is syntactically valid JavaScript', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  const script = extractInlineScript(html);
  assert.ok(script.length > 0, 'should have an inline script');
  assert.doesNotThrow(() => {
    new vm.Script(script, { filename: 'inline-page-script.js' });
  }, SyntaxError, 'inline script must be syntactically valid JavaScript');
});

test('inline script does not use nested-quote onclick pattern', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  const script = extractInlineScript(html);
  const hasBrokenOnclick = /innerHTML\s*=\s*'[^']*onclick="[^"]*'[^"]*'[^"]*"[^']*'/.test(script);
  assert.equal(hasBrokenOnclick, false,
    'must not nest single quotes inside onclick inside a single-quoted JS string');
});

test('inline script executes without runtime errors in DOM mock', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  const script = extractInlineScript(html);

  const mockEl = {
    innerHTML: '',
    focus: () => {},
    onsubmit: null,
    addEventListener: () => {},
    querySelector: () => mockEl,
    querySelectorAll: () => [],
    getElementById: () => mockEl,
    dataset: {},
  };
  const context = vm.createContext({
    document: {
      querySelector: () => mockEl,
      querySelectorAll: () => [],
      getElementById: () => mockEl,
    },
    fetch: async () => ({ status: 401, json: async () => ({}) }),
    location: { href: '' },
    FormData: class { entries() { return []; } },
    console,
  });

  assert.doesNotThrow(() => {
    vm.runInContext(script, context, { filename: 'inline-page-script.js' });
  }, 'inline script must execute without throwing');
});

test('/api/health works without auth or DB', async () => {
  const r = await worker.fetch(new Request('https://x/api/health'), {});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('/login redirects to auth broker', async () => {
  const env = {
    ANYSHIP_AUTH_URL: 'https://auth.example.com',
    ANYSHIP_AUTH_APP_ID: 'app-123',
  };
  const r = await worker.fetch(new Request('https://x/login'), env);
  assert.equal(r.status, 302);
  const loc = r.headers.get('location');
  assert.ok(loc.includes('auth.example.com/broker/authorize'), `redirect location: ${loc}`);
  assert.ok(loc.includes('provider=google'), 'should use google provider');
  assert.ok(loc.includes('app=app-123'), 'should include app id');
});

test('creates secure session tokens', () => {
  assert.match(sessionToken(), /^[a-f0-9]{64}$/);
});

test('parses cookies correctly', () => {
  assert.equal(parseCookies('session=hello%20team').session, 'hello team');
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(null), {});
});

test('unauthenticated GET / does NOT show marketing landing or login wall', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  assert.ok(!html.includes('Your team is waiting'), 'No marketing copy as primary content');
  assert.ok(!html.includes('DEMO SHAPE'), 'No architecture lecture');
  assert.ok(!html.includes('static shell'), 'No meta commentary about stack');
});

test('page has viewport meta tag', async () => {
  const r = await worker.fetch(new Request('https://x/'), {});
  const html = await r.text();
  assert.match(html, /viewport/);
});
